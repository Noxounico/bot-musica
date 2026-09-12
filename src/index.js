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

listenForPlatform();

const { SpotifyMirrorSync } = require('./sync');

console.log('[boot] env present', {
  DISCORD_TOKEN: Boolean(config.discordToken),
  DISCORD_CLIENT_ID: Boolean(config.discordClientId),
  DISCORD_GUILD_ID: Boolean(config.discordGuildId),
  SPOTIFY_CLIENT_ID: Boolean(config.spotifyClientId),
  SPOTIFY_CLIENT_SECRET: Boolean(config.spotifyClientSecret),
  SPOTIFY_REFRESH_TOKEN: Boolean(config.spotifyRefreshToken),
});

const mirror = new SpotifyMirrorSync(config);

const slashCommands = [
  new SlashCommandBuilder()
    .setName('entrar')
    .setDescription('O bot entra no teu canal de voz e começa a espelhar o Spotify'),
  new SlashCommandBuilder()
    .setName('sair')
    .setDescription('Para o espelhamento e sai do canal de voz'),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Mostra o painel do Spotify'),
  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Volta a publicar o painel do Spotify com controlos'),
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

async function runCommand(command, { member, reply }) {
  if (command === 'entrar') {
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) {
      await reply('Entra tu num canal de voz primeiro, depois escreve `!entrar` (ou `/entrar`).');
      return;
    }

    await mirror.join(voiceChannel);
    const status = mirror.getStatus();
    if (status.spotify) {
      setListeningActivity(status.spotify);
    }

    const sent = await reply({
      content: accountLine(status),
      ...mirror.panelPayload(),
    });
    if (sent) {
      mirror.attachPanel(sent);
    }
    return;
  }

  if (command === 'sair') {
    mirror.leave();
    await reply('Saí do canal de voz e fechei o painel do Spotify.');
    return;
  }

  if (command === 'status' || command === 'painel') {
    const sent = await reply({
      content: accountLine(mirror.getStatus()),
      ...mirror.panelPayload(),
    });
    if (sent) {
      mirror.attachPanel(sent);
    }
  }
}

function accountLine(status) {
  const name = status.account?.displayName;
  if (status.spotify) {
    return name
      ? `**${name}** · ${status.spotify.artists} — ${status.spotify.title}`
      : `${status.spotify.artists} — ${status.spotify.title}`;
  }
  return status.lastError || 'Painel Spotify. Abre o Spotify e mete uma música.';
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
  try {
    await registerSlashCommands(client);
  } catch (error) {
    console.error('[discord] Failed to register slash commands:', error.message);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) {
    return;
  }

  const command = parsePrefixCommand(message.content);
  if (!command || !['entrar', 'sair', 'status', 'painel'].includes(command)) {
    return;
  }

  try {
    await runCommand(command, {
      member: message.member,
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
    if (!['entrar', 'sair', 'status', 'painel'].includes(command)) {
      return;
    }

    await interaction.deferReply();
    await runCommand(command, {
      member: interaction.member,
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

  if (id === 'spotify_prev') {
    await mirror.previousSpotify();
    return;
  }
  if (id === 'spotify_next') {
    await mirror.nextSpotify();
    return;
  }

  const playing = Boolean(mirror.getStatus().spotify?.isPlaying);
  if (playing) {
    await mirror.pauseSpotify();
  } else {
    await mirror.resumeSpotify();
  }
  } catch (error) {
    mirror.lastError = error.message;
    console.error('[discord] Panel button error:', error);
    await mirror.refreshPanel({ force: true });
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

if (config.missingSpotify.length) {
  console.error(`[spotify] Missing ${config.missingSpotify.join(', ')}. !entrar will fail until they are set.`);
}

process.on('SIGINT', () => {
  mirror.leave();
  client.destroy();
  process.exit(0);
});
