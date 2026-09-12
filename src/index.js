const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
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
    .setDescription('Mostra o estado atual do Spotify e do Discord'),
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

function statusEmbed() {
  const status = mirror.getStatus();
  const embed = new EmbedBuilder()
    .setTitle('Estado do espelhamento')
    .setColor(status.enabled ? 0x1db954 : 0x5865f2)
    .addFields(
      {
        name: 'Discord',
        value: status.discord.connected
          ? `Conectado · ${status.discord.paused ? 'Pausado' : status.discord.playerStatus} · volume ${status.discord.volume}%`
          : 'Desconectado',
      },
      {
        name: 'Spotify',
        value: status.spotify
          ? `${status.spotify.artists} — ${status.spotify.title}\n${status.spotify.isPlaying ? 'A tocar' : 'Em pausa'}`
          : 'Nada a tocar (ou Spotify fechado)',
      },
    );

  if (status.lastError) {
    embed.addFields({ name: 'Último erro', value: status.lastError });
  }

  return embed;
}

async function runCommand(command, { member, reply }) {
  if (command === 'entrar') {
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) {
      await reply('Entra tu num canal de voz primeiro, depois escreve `!entrar` (ou `/entrar`).');
      return;
    }

    const channelName = await mirror.join(voiceChannel);
    await reply(`A espelhar o Spotify em **${channelName}**. Muda música, pausa ou avança no Spotify — o bot segue.`);
    return;
  }

  if (command === 'sair') {
    mirror.leave();
    await reply('Saí do canal de voz e parei de espelhar o Spotify.');
    return;
  }

  if (command === 'status') {
    await reply({ embeds: [statusEmbed()] });
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

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
  if (!command || !['entrar', 'sair', 'status'].includes(command)) {
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
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = interaction.commandName;
  if (!['entrar', 'sair', 'status'].includes(command)) {
    return;
  }

  try {
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
      await interaction.reply(payload).catch(() => {});
    }
  }
});

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
