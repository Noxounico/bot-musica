const {
  Client,
  GatewayIntentBits,
  ActivityType,
} = require('discord.js');
const { listenForPlatform } = require('./health');
const config = require('./config');
const { parsePrefixCommand } = require('./prefix');
const { SpotifyMirrorSync } = require('./sync');
const playlists = require('./playlists');
const { deleteStaleBotMessages } = require('./cleanup');
const {
  COMMAND_NAMES,
  registerSlashCommands,
  isPlayCommand,
  playArgsFrom,
} = require('./commands');

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

const COMMANDS = COMMAND_NAMES;
const PANEL_BUTTONS = new Set([
  'spotify_prev',
  'spotify_playpause',
  'spotify_next',
  'spotify_leave',
  'nox_voldown',
  'nox_volup',
  'nox_save',
  'nox_shuffle',
  'nox_clip',
]);

function accountLine(status) {
  if (status.spotify) {
    const label = status.spotify.isPlaying ? 'A tocar no Discord' : 'Em pausa';
    return `${label}: **${status.spotify.artists} — ${status.spotify.title}**`;
  }
  return status.lastError || 'Usa `/play` ou `/add`. Não precisas do Spotify aberto nem de Premium.';
}

function memberAccount(member) {
  return {
    displayName: member?.displayName || member?.user?.username,
    imageUrl: member?.displayAvatarURL?.() || null,
  };
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

async function ensurePanel(channel) {
  if (channel) {
    mirror.panelChannel = channel;
  }
  if (mirror.panelMessage) {
    await mirror.refreshPanel();
  } else if (mirror.panelChannel?.send) {
    const sent = await mirror.panelChannel.send({
      content: mirror.panelContent(),
      ...mirror.panelPayload(),
    });
    mirror.attachPanel(sent);
  }

  const panel = mirror.panelMessage;
  await deleteStaleBotMessages(mirror.panelChannel, {
    keepId: panel?.id,
    botId: panel?.client?.user?.id || mirror.panelChannel?.client?.user?.id,
  });
  return panel;
}

async function runCommand(command, { member, reply, args, channel }) {
  if (command === 'entrar') {
    await ensureJoined(member);
    registerSlashCommands(client).catch((error) => {
      console.error('[discord] Failed to refresh slash commands:', error.message);
    });
    mirror.panelChannel = channel || member?.voice?.channel;
    await ensurePanel(mirror.panelChannel);
    await reply(accountLine(mirror.getStatus()));
    return;
  }

  if (isPlayCommand(command)) {
    const query = String(args || '').trim();
    if (!query) {
      await reply('Diz o nome da música. Exemplo: `/play bohemian rhapsody` ou `/add uma sugestão`');
      return;
    }

    await ensureJoined(member);
    mirror.panelChannel = channel || member?.voice?.channel;
    const replace = command !== 'add';
    const result = await mirror.playQuery(query, memberAccount(member), { replace });
    await ensurePanel(mirror.panelChannel);
    const content = result.queued
      ? `**${result.track.title}** ficou na fila (posição ${result.position}).`
      : `A tocar **${result.track.title}**.`;
    await reply(content);
    return;
  }

  if (command === 'volume') {
    const level = Number(args);
    if (!Number.isFinite(level)) {
      await reply('Usa `/volume 40` — um número de 0 a 100.');
      return;
    }
    await mirror.setVolume(level);
    await reply(`Volume **${mirror.player.getVolumePercent()}%**.`);
    return;
  }

  if (command === 'clipe') {
    const track = mirror.current;
    if (!track) {
      await reply('Não há música a tocar. Usa `/play`.');
      return;
    }
    const clip = track.youtubeUrl || (track.searchQuery
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(track.searchQuery)}`
      : track.externalUrl);
    await reply(clip ? `🎬 **${track.title}**\n${clip}` : 'Sem clipe para esta faixa.');
    return;
  }

  if (command === 'sair') {
    mirror.leave();
    await reply('Saí do canal de voz.');
    return;
  }

  if (command === 'status' || command === 'painel') {
    mirror.panelChannel = channel || mirror.panelChannel;
    await ensurePanel(mirror.panelChannel);
    await reply(accountLine(mirror.getStatus()));
  }
}

async function handlePlaylist(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const name = interaction.options.getString('nome');

  if (sub === 'criar') {
    const playlist = playlists.create(guildId, name);
    await interaction.editReply(`Playlist **${playlist.name}** pronta. Usa \`/playlist add ${playlist.name}\` ou o botão Playlist.`);
    await mirror.refreshPanel();
    return;
  }

  if (sub === 'add') {
    const query = interaction.options.getString('musica');
    const track = query
      ? await mirror.resolveTrack(query)
      : mirror.current;
    const playlist = playlists.add(guildId, name, track);
    await interaction.editReply(`**${track.title}** entrou em **${playlist.name}** (${playlist.tracks.length} faixas).`);
    await mirror.refreshPanel();
    return;
  }

  if (sub === 'tocar') {
    await ensureJoined(interaction.member);
    mirror.guildId = guildId;
    mirror.panelChannel = interaction.channel;
    const playlist = await mirror.playPlaylist(name);
    await ensurePanel(interaction.channel);
    await interaction.editReply(`A tocar a playlist **${playlist.name}** (${playlist.tracks.length} faixas).`);
    return;
  }

  const items = playlists.list(guildId);
  if (!items.length) {
    await interaction.editReply('Ainda não há playlists. `/playlist criar festa`');
    return;
  }
  await interaction.editReply(
    items.map((item) => `• **${item.name}** — ${item.tracks.length} faixas`).join('\n'),
  );
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
      channel: message.channel,
      reply: async (payload) => {
        const sent = await message.reply(typeof payload === 'string' ? payload : payload);
        sent.delete().catch(() => {});
        return sent;
      },
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

    if (interaction.isStringSelectMenu() && interaction.customId === 'nox_suggest') {
      await handleSuggestion(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = interaction.commandName;
    if (!COMMANDS.includes(command)) {
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    if (command === 'playlist') {
      await handlePlaylist(interaction);
      return;
    }

    const args = isPlayCommand(command)
      ? playArgsFrom(interaction)
      : (command === 'volume' ? String(interaction.options.getInteger('nivel') ?? '') : '');

    await runCommand(command, {
      member: interaction.member,
      args,
      channel: interaction.channel,
      reply: async (payload) => interaction.editReply(typeof payload === 'string' ? payload : payload),
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

async function handleSuggestion(interaction) {
  await interaction.deferUpdate();
  const raw = interaction.values?.[0] || '';
  const index = Number(String(raw).split(':')[0]);
  const picked = Number.isInteger(index) ? mirror.suggestions[index] : null;
  const query = picked?.externalUrl || picked?.searchQuery || raw.slice(raw.indexOf(':') + 1);
  if (!query) {
    return;
  }
  try {
    await mirror.playQuery(query, memberAccount(interaction.member));
    await mirror.refreshPanel();
  } catch (error) {
    mirror.lastError = error.message;
    await mirror.refreshPanel();
  }
}

async function handlePanelButton(interaction) {
  const id = interaction.customId;
  if (!PANEL_BUTTONS.has(id)) {
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

    if (!mirror.player.isConnected() && id !== 'nox_clip') {
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

    if (id === 'nox_voldown') {
      await mirror.adjustVolume(-10);
      return;
    }

    if (id === 'nox_volup') {
      await mirror.adjustVolume(10);
      return;
    }

    if (id === 'nox_shuffle') {
      await mirror.shuffle();
      return;
    }

    if (id === 'nox_save') {
      const playlist = mirror.saveSessionPlaylist();
      await interaction.followUp({
        content: `Playlist **${playlist.name}** guardada com ${playlist.tracks.length} faixas. \`/playlist tocar ${playlist.name}\``,
        ephemeral: true,
      });
      await mirror.refreshPanel();
      return;
    }

    if (id === 'nox_clip') {
      const track = mirror.current;
      const clip = track?.youtubeUrl || track?.externalUrl;
      await interaction.followUp({
        content: clip ? `🎬 **${track.title}**\n${clip}` : 'Sem clipe. Usa `/play` primeiro.',
        ephemeral: true,
      });
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
