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

const commands = [
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

async function registerCommands(client) {
  if (!config.discordClientId) {
    console.error('[discord] DISCORD_CLIENT_ID (or CLIENT_ID) is not set; slash commands will not register.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const body = { body: commands };

  if (config.discordGuildId) {
    await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), body);
    console.log(`[discord] Registered guild commands for ${config.discordGuildId}`);
    return;
  }

  await rest.put(Routes.applicationCommands(config.discordClientId), body);
  console.log('[discord] Registered global commands');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once('ready', async () => {
  console.log(`[discord] Logged in as ${client.user.tag}`);
  try {
    await registerCommands(client);
  } catch (error) {
    console.error('[discord] Failed to register commands:', error.message);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    if (interaction.commandName === 'entrar') {
      const member = interaction.member;
      const voiceChannel = member?.voice?.channel;

      if (!voiceChannel) {
        await interaction.reply({
          content: 'Entra num canal de voz primeiro, depois usa `/entrar`.',
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      const channelName = await mirror.join(voiceChannel);

      await interaction.editReply({
        content: `A espelhar o Spotify em **${channelName}**. Muda música, pausa ou avança no Spotify — o bot segue.`,
      });
      return;
    }

    if (interaction.commandName === 'sair') {
      mirror.leave();
      await interaction.reply({
        content: 'Saí do canal de voz e parei de espelhar o Spotify.',
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === 'status') {
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

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch (error) {
    console.error('[discord] Command error:', error);
    const payload = { content: `Erro: ${error.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
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
  console.error(`[spotify] Missing ${config.missingSpotify.join(', ')}. /entrar will fail until they are set.`);
}

process.on('SIGINT', () => {
  mirror.leave();
  client.destroy();
  process.exit(0);
});
