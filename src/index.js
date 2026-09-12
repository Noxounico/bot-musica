const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ActivityType,
} = require('discord.js');
const { listenForPlatform } = require('./health');
const config = require('./config');
const { parsePrefixCommand } = require('./prefix');
const { SpotifyMirrorSync } = require('./sync');

listenForPlatform();

console.log('[boot] env present', {
  DISCORD_TOKEN: Boolean(config.discordToken),
  DISCORD_CLIENT_ID: Boolean(config.discordClientId),
  DISCORD_GUILD_ID: Boolean(config.discordGuildId),
  SPOTIFY_CLIENT_ID: Boolean(config.spotifyClientId),
  SPOTIFY_CLIENT_SECRET: Boolean(config.spotifyClientSecret),
  SPOTIFY_SEARCH: Boolean(config.spotifyClientId && config.spotifyClientSecret),
});

const mirror = new SpotifyMirrorSync(config);

const COMMANDS = ['entrar', 'sair', 'status', 'painel', 'play'];

const slashCommands = [
  new SlashCommandBuilder()
    .setName('entrar')
    .setDescription('Entra no teu canal de voz e mostra o painel do NoxMusic'),
  new SlashCommandBuilder()
    .setName('sair')
    .setDescription('Sai do canal de voz'),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Mostra o painel de reprodução'),
  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Volta a publicar o painel com controlos'),
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Toca uma música no Discord. Não precisa do Spotify aberto.')
    .addStringOption((option) =>
      option
        .setName('musica')
        .setDescription('Nome da música, ou link do YouTube / Spotify')
        .setRequired(true),
    ),
].map((command) => command.toJSON());

async function registerSlashCommands(client) {
  if (!config.discordToken || !config.discordClientId) {
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const body = { body: slashCommands };
  const guildIds = new Set(client.guilds.cache.map((guild) => guild.id));
  if (config.discordGuildId) {
    guildIds.add(config.discordGuildId);
  }

  if (guildIds.size === 0) {
    await rest.put(Routes.applicationCommands(config.discordClientId), body);
    console.log('[discord] Registered global slash commands (no guilds cached yet)');
    return;
  }

  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(config.discordClientId, guildId), body);
    console.log(`[discord] Registered guild commands for ${guildId}`);
  }
}

function accountLine(status) {
  if (status.spotify) {
    const label = status.spotify.isPlaying ? 'A tocar no Discord' : 'Em pausa';
    return `${label}: **${status.spotify.artists} — ${status.spotify.title}**`;
  }
  return status.lastError || 'Usa `/play nome da música`. Não precisas do Spotify aberto nem de Premium.';
}

async function ensureJoined(member) {
  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel) {
    throw new Error('Entra num canal de voz primeiro, depois usa `/play` ou `/entrar`.');
  }
  if (!mirror.player.isConnected() || mirror.player.channelId !== voiceChannel.id) {
    await mirror.join(voiceChannel);
  }
  return voiceChannel;
}

async function publishPanel(reply, content) {
  const sent = await reply({
    content,
    ...mirror.panelPayload(),
  });
  if (sent) {
    mirror.attachPanel(sent);
  }
  return sent;
}

async function runCommand(command, { member, reply, args }) {
  if (command === 'entrar') {
    await ensureJoined(member);
    await publishPanel(reply, accountLine(mirror.getStatus()));
    return;
  }

  if (command === 'play') {
    const query = String(args || '').trim();
    if (!query) {
      await reply('Diz o nome da música. Exemplo: `/play bohemian rhapsody`');
      return;
    }

    await ensureJoined(member);
    const result = await mirror.playQuery(query, {
      displayName: member?.displayName || member?.user?.username,
      imageUrl: member?.displayAvatarURL?.() || null,
    });
    const content = result.queued
      ? `**${result.track.title}** ficou na fila (posição ${result.position}).`
      : `A tocar **${result.track.title}**.`;
    await publishPanel(reply, content);
    return;
  }

  if (command === 'sair') {
    mirror.leave();
    await reply('Saí do canal de voz.');
    return;
  }

  if (command === 'status' || command === 'painel') {
    await publishPanel(reply, accountLine(mirror.getStatus()));
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

function setListeningActivity(spotify) {
  if (!client.user || !spotify) {
    return;
  }
  client.user.setActivity(`${spotify.artists} — ${spotify.title}`, {
    type: ActivityType.Listening,
  });
}

mirror.onTrack = setListeningActivity;

client.once('ready', async () => {
  console.log(`[discord] Logged in as ${client.user.tag}`);
  if (config.spotifyClientId && config.spotifyClientSecret) {
    console.log('[spotify] Search API ready (client_credentials). Sem Premium, sem app aberta.');
  } else {
    console.log('[spotify] Search opcional. Sem Client ID o bot toca na mesma via YouTube.');
  }
  try {
    await registerSlashCommands(client);
  } catch (error) {
    console.error('[discord] Failed to register slash commands:', error.message);
  }
});

client.on('guildCreate', async (guild) => {
  try {
    await registerSlashCommands(client);
    console.log(`[discord] Registered commands for new guild ${guild.name}`);
  } catch (error) {
    console.error('[discord] Failed to register slash commands:', error.message);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) {
    return;
  }

  const parsed = parsePrefixCommand(message.content);
  if (!parsed || !COMMANDS.includes(parsed.name)) {
    return;
  }

  try {
    await runCommand(parsed.name, {
      member: message.member,
      args: parsed.args,
      reply: (payload) => message.reply(payload),
    });
  } catch (error) {
    console.error('[discord] Command error:', error);
    await message.reply(`Erro: ${error.message}`).catch(() => {});
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      await handlePanelButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = interaction.commandName;
    if (!COMMANDS.includes(command)) {
      return;
    }

    const args = command === 'play'
      ? (interaction.options.getString('musica') || interaction.options.getString('query') || '')
      : '';

    await interaction.deferReply();
    await runCommand(command, {
      member: interaction.member,
      args,
      reply: async (payload) => interaction.editReply(payload),
    });
  } catch (error) {
    console.error('[discord] Command error:', error);
    const payload = { content: `Erro: ${error.message}` };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply({ content: payload.content, ephemeral: true }).catch(() => {});
    }
  }
});

async function handlePanelButton(interaction) {
  const id = interaction.customId;
  if (!['spotify_prev', 'spotify_playpause', 'spotify_next', 'spotify_leave'].includes(id)) {
    return;
  }

  await interaction.deferUpdate();

  try {
    if (id === 'spotify_leave') {
      mirror.leave();
      await interaction.editReply({
        content: 'Saí do canal de voz.',
        embeds: [],
        components: [],
      }).catch(() => {});
      return;
    }

    if (!mirror.player.isConnected()) {
      mirror.lastError = 'Não estou no canal. Usa /entrar e depois /play.';
      await mirror.refreshPanel();
      return;
    }

    if (id === 'spotify_prev') {
      await mirror.previous();
      return;
    }

    if (id === 'spotify_next') {
      await mirror.next();
      return;
    }

    if (mirror.getStatus().spotify?.isPlaying) {
      await mirror.pause();
    } else {
      await mirror.resume();
    }
  } catch (error) {
    mirror.lastError = error.message;
    console.error('[discord] Panel button error:', error);
    await mirror.refreshPanel();
  }
}

if (!config.discordToken) {
  console.error('[discord] Missing DISCORD_TOKEN (or TOKEN). Set it in Railway Variables.');
  if (!config.onRailway) {
    process.exit(1);
  }
} else {
  client.login(config.discordToken).catch((error) => {
    console.error('[discord] Login failed:', error.message);
    if (!config.onRailway) {
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => {
  mirror.leave();
  client.destroy();
  process.exit(0);
});
