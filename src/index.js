const {
  Client,
  GatewayIntentBits,
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

async function clearSlashCommands() {
  if (!config.discordToken || !config.discordClientId) {
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  await rest.put(Routes.applicationCommands(config.discordClientId), { body: [] });
  if (config.discordGuildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
      { body: [] },
    );
  }
  console.log('[discord] Removed slash commands; use !entrar !sair !status');
}

async function handleCommand(message, command) {
  if (command === 'entrar') {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      await message.reply('Entra num canal de voz primeiro, depois usa `!entrar`.');
      return;
    }

    const channelName = await mirror.join(voiceChannel);
    await message.reply(`A espelhar o Spotify em **${channelName}**. Muda música, pausa ou avança no Spotify — o bot segue.`);
    return;
  }

  if (command === 'sair') {
    mirror.leave();
    await message.reply('Saí do canal de voz e parei de espelhar o Spotify.');
    return;
  }

  if (command === 'status') {
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

    await message.reply({ embeds: [embed] });
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', async () => {
  console.log(`[discord] Logged in as ${client.user.tag}`);
  try {
    await clearSlashCommands();
  } catch (error) {
    console.error('[discord] Failed to clear slash commands:', error.message);
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
    await handleCommand(message, command);
  } catch (error) {
    console.error('[discord] Command error:', error);
    await message.reply(`Erro: ${error.message}`).catch(() => {});
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
