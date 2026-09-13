const {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { listenForPlatform } = require('./health');
const config = require('./config');
const { parseChatCommand, parsePlaylistArgs } = require('./prefix');
const { parseSeekInput } = require('./seek');
const { formatClock } = require('./panel');
const { SpotifyMirrorSync } = require('./sync');
const playlists = require('./playlists');
const { deleteStaleBotMessages } = require('./cleanup');
const { controllerFromMember } = require('./account');
const {
  COMMAND_NAMES,
  registerSlashCommands,
  isPlayCommand,
  playArgsFrom,
} = require('./commands');
const {
  shouldHintUnreadableChat,
  emptyChatHint,
  pickVoiceMember,
} = require('./chat');

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

const COMMANDS = [...COMMAND_NAMES, 'atras', 'avancar'];
const SEEK_BUTTONS = {
  nox_seek_back30: -30_000,
  nox_seek_back15: -15_000,
  nox_seek_fwd15: 15_000,
  nox_seek_fwd30: 30_000,
};
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
  'nox_stop',
  'nox_radio',
  ...Object.keys(SEEK_BUTTONS),
]);

function accountLine(status) {
  if (status.spotify) {
    const label = status.spotify.isPlaying ? 'A tocar no Discord' : 'Em pausa';
    return `${label}: **${status.spotify.artists} — ${status.spotify.title}**`;
  }
  if (status.lastError) {
    return status.lastError;
  }
  return mirror.canReadChat
    ? 'Usa `!play` ou `!add`. Não precisas do Spotify aberto nem de Premium.'
    : 'Clica **Tocar** ou menciona-me. O Discord esconde `!play` neste servidor.';
}

function memberAccount(member) {
  return controllerFromMember(member);
}

async function ensureJoined(member) {
  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel) {
    throw new Error('Entra num canal de voz primeiro, depois usa `!play` ou `!entrar`.');
  }
  const account = memberAccount(member);
  if (!mirror.player.isConnected() || mirror.player.channelId !== voiceChannel.id) {
    await mirror.join(voiceChannel, account);
  } else {
    mirror.setController(account);
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
    keepIds: [mirror.clipMessage?.id].filter(Boolean),
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
      await reply('Diz o nome da música. Exemplo: `!play bohemian rhapsody` ou `!add uma sugestão`');
      return;
    }

    await ensureJoined(member);
    mirror.panelChannel = channel || member?.voice?.channel;
    const replace = command !== 'add' && !mirror.current;
    const result = await mirror.playQuery(query, memberAccount(member), { replace });
    await ensurePanel(mirror.panelChannel);
    const content = result.queued
      ? `**${result.track.title}** ficou na fila (posição ${result.position}).`
      : `A tocar **${result.track.title}**.`;
    await reply(content);
    return;
  }

  if (command === 'atras' || command === 'avancar' || command === 'seek') {
    let input = String(args || '').trim();
    if (command === 'atras') {
      const seconds = Number.parseInt(input, 10);
      input = Number.isFinite(seconds) && seconds > 0 ? `-${seconds}` : '-15';
    } else if (command === 'avancar') {
      const seconds = Number.parseInt(input, 10);
      input = Number.isFinite(seconds) && seconds > 0 ? `+${seconds}` : '+15';
    }

    const parsed = parseSeekInput(input);
    if (!parsed) {
      await reply('Usa `!atras`, `!avancar`, `!seek +15` ou `!seek 1:30`.');
      return;
    }

    const state = parsed.type === 'relative'
      ? await mirror.seekBy(parsed.ms)
      : await mirror.seekTo(parsed.ms);
    await reply(`Fui para \`${formatClock(state?.progressMs)}\`.`);
    return;
  }

  if (command === 'volume') {
    const level = Number(args);
    if (!Number.isFinite(level)) {
      await reply('Usa `!volume 40` — um número de 0 a 100.');
      return;
    }
    await mirror.setVolume(level);
    await reply(`Volume **${mirror.player.getVolumePercent()}%**.`);
    return;
  }

  if (command === 'clipe') {
    const url = await mirror.showClip(channel || mirror.panelChannel);
    await reply(`🎬 ${url}`);
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
    return;
  }

  if (command === 'playlist') {
    const parsed = parsePlaylistArgs(args);
    await runPlaylist({
      ...parsed,
      member,
      channel,
      guildId: member?.guild?.id,
      reply,
    });
  }
}

async function runPlaylist({ sub, name, query, member, channel, guildId, reply }) {
  if (sub === 'criar') {
    const playlist = playlists.create(guildId, name);
    await reply(`Playlist **${playlist.name}** pronta. Usa \`!playlist add ${playlist.name}\` ou o botão Playlist.`);
    await mirror.refreshPanel();
    return;
  }

  if (sub === 'add') {
    const track = query
      ? await mirror.resolveTrack(query)
      : mirror.current;
    const playlist = playlists.add(guildId, name, track);
    await reply(`**${track.title}** entrou em **${playlist.name}** (${playlist.tracks.length} faixas).`);
    await mirror.refreshPanel();
    return;
  }

  if (sub === 'tocar') {
    await ensureJoined(member);
    mirror.guildId = guildId;
    mirror.panelChannel = channel;
    mirror.setController(memberAccount(member));
    const playlist = await mirror.playPlaylist(name);
    await ensurePanel(channel);
    await reply(`A tocar a playlist **${playlist.name}** (${playlist.tracks.length} faixas).`);
    return;
  }

  const items = playlists.list(guildId);
  if (!items.length) {
    await reply('Ainda não há playlists. `!playlist criar festa`');
    return;
  }
  await reply(
    items.map((item) => `• **${item.name}** — ${item.tracks.length} faixas`).join('\n'),
  );
}

function findVoiceMember(userId) {
  return pickVoiceMember(userId, [...client.guilds.cache.values()], config.discordGuildId);
}

async function maybeHintUnreadableChat(message) {
  if (mirror.canReadChat) {
    return;
  }

  const authorChannelId = message.member?.voice?.channelId || message.member?.voice?.channel?.id || null;
  const shouldHint = shouldHintUnreadableChat({
    content: message.content,
    authorInVoice: Boolean(authorChannelId),
    authorChannelId,
    botChannelId: mirror.player.channelId || null,
    inPanelChannel: Boolean(mirror.panelChannel && message.channelId === mirror.panelChannel.id),
    lastHintAt: emptyChatHints.get(message.author.id) || 0,
  });
  if (!shouldHint) {
    return;
  }

  emptyChatHints.set(message.author.id, Date.now());
  await message.reply(emptyChatHint({ botId: message.client.user?.id })).catch(() => {});
}

async function handleDirectMessage(message) {
  const parsed = parseChatCommand(message.content, {
    botId: message.client.user?.id,
    commandNames: COMMANDS,
  });
  if (!parsed || !COMMANDS.includes(parsed.name)) {
    return;
  }

  const member = findVoiceMember(message.author.id);
  if (!member) {
    await message.reply(
      'Entra num canal de voz no servidor e volta a escrever `!play` aqui. Sem Message Content o chat do servidor esconde o texto.',
    ).catch(() => {});
    return;
  }

  try {
    await runCommand(parsed.name, {
      member,
      args: parsed.args,
      channel: mirror.panelChannel || member.voice?.channel,
      reply: async (payload) => message.reply(typeof payload === 'string' ? payload : payload),
    });
  } catch (error) {
    console.error('[discord] DM command error:', error);
    await message.reply(`Erro: ${error.message}`).catch(() => {});
  }
}

const BASE_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.DirectMessages,
];

function createDiscordClient(withMessageContent) {
  const intents = [...BASE_INTENTS];
  if (withMessageContent) {
    intents.push(GatewayIntentBits.MessageContent);
  }
  return new Client({
    intents,
    partials: [Partials.Channel, Partials.Message],
  });
}

const emptyChatHints = new Map();

let client = createDiscordClient(true);

function setListeningActivity(spotify) {
  if (!client.user || !spotify) {
    return;
  }
  client.user.setActivity(`${spotify.artists} — ${spotify.title}`, {
    type: ActivityType.Listening,
  });
}

mirror.onTrack = setListeningActivity;

function bindDiscord(nextClient) {
  nextClient.once('ready', async () => {
    const messageContent = nextClient.options.intents.has(GatewayIntentBits.MessageContent);
    mirror.canReadChat = messageContent;
    console.log(`[discord] Logged in as ${nextClient.user.tag}`);
    console.log(
      messageContent
        ? '[discord] Message Content ligado. !play no chat funciona.'
        : '[discord] Message Content desligado. !play no chat fica vazio — usa o botão Tocar ou menciona o bot.',
    );
    if (config.spotifyClientId && config.spotifyClientSecret) {
      console.log('[spotify] Search API ready (client_credentials). Sem Premium, sem app aberta.');
    } else {
      console.log('[spotify] Search opcional. Sem Client ID o bot toca na mesma via YouTube.');
    }
    try {
      await registerSlashCommands(nextClient);
    } catch (error) {
      console.error('[discord] Failed to register slash commands:', error.message);
    }
  });

  nextClient.on('guildCreate', async (guild) => {
    try {
      await registerSlashCommands(nextClient);
      console.log(`[discord] Registered commands for new guild ${guild.name}`);
    } catch (error) {
      console.error('[discord] Failed to register slash commands:', error.message);
    }
  });

  nextClient.on('messageCreate', async (message) => {
    if (message.author.bot) {
      return;
    }

    if (!message.guild) {
      await handleDirectMessage(message);
      return;
    }

    const parsed = parseChatCommand(message.content, {
      botId: message.client.user?.id,
      commandNames: COMMANDS,
    });
    if (parsed && COMMANDS.includes(parsed.name)) {
      try {
        await runCommand(parsed.name, {
          member: message.member,
          args: parsed.args,
          channel: message.channel,
          reply: async (payload) => message.reply(typeof payload === 'string' ? payload : payload),
        });
      } catch (error) {
        console.error('[discord] Command error:', error);
        await message.reply(`Erro: ${error.message}`).catch(() => {});
      }
      return;
    }

    await maybeHintUnreadableChat(message);
  });

  nextClient.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId === 'nox_play') {
      await showPlayModal(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'nox_play_modal') {
      await handlePlayModal(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handlePanelButton(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'nox_seek_jump') {
      await handleSeekJump(interaction);
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
      await runPlaylist({
        sub: interaction.options.getSubcommand(),
        name: interaction.options.getString('nome'),
        query: interaction.options.getString('musica'),
        member: interaction.member,
        channel: interaction.channel,
        guildId: interaction.guildId,
        reply: async (payload) => interaction.editReply(typeof payload === 'string' ? payload : payload),
      });
      return;
    }

    const args = isPlayCommand(command)
      ? playArgsFrom(interaction)
      : (command === 'volume'
        ? String(interaction.options.getInteger('nivel') ?? '')
        : (command === 'seek' ? String(interaction.options.getString('tempo') ?? '') : ''));

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
}

bindDiscord(client);

async function showPlayModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('nox_play_modal')
    .setTitle('Tocar no NoxMusic');
  const input = new TextInputBuilder()
    .setCustomId('query')
    .setLabel('Nome da música ou link')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('mtg ficar legal')
    .setMaxLength(200);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handlePlayModal(interaction) {
  const query = interaction.fields.getTextInputValue('query');
  await interaction.deferReply({ ephemeral: true });
  await runCommand('play', {
    member: interaction.member,
    args: query,
    channel: interaction.channel,
    reply: async (payload) => interaction.editReply(typeof payload === 'string' ? payload : payload),
  });
}

async function handleSeekJump(interaction) {
  await interaction.deferUpdate();
  mirror.setController(memberAccount(interaction.member));
  const target = Number(interaction.values?.[0]);
  if (!Number.isFinite(target)) {
    return;
  }
  try {
    await mirror.seekTo(target);
  } catch (error) {
    mirror.lastError = error.message;
    await mirror.refreshPanel();
  }
}

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
    await mirror.playQuery(query, memberAccount(interaction.member), { replace: true });
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
  mirror.setController(memberAccount(interaction.member));

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
      mirror.lastError = 'Não estou no canal. Usa !entrar e depois !play.';
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

    if (id === 'nox_stop') {
      await mirror.stopPlayback();
      return;
    }

    if (id === 'nox_radio') {
      await mirror.toggleRadio();
      return;
    }

    if (Object.hasOwn(SEEK_BUTTONS, id)) {
      await mirror.seekBy(SEEK_BUTTONS[id]);
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
        content: `Playlist **${playlist.name}** guardada com ${playlist.tracks.length} faixas. \`!playlist tocar ${playlist.name}\``,
        ephemeral: true,
      });
      await mirror.refreshPanel();
      return;
    }

    if (id === 'nox_clip') {
      try {
        await mirror.showClip(interaction.channel || mirror.panelChannel);
      } catch (error) {
        await interaction.followUp({ content: error.message, ephemeral: true });
      }
      return;
    }

    if (mirror.getStatus().spotify?.isPlaying) {
      await mirror.pause();
    } else if (mirror.current) {
      await mirror.resume();
    } else {
      await mirror.startRadio(memberAccount(interaction.member));
    }
  } catch (error) {
    mirror.lastError = error.message;
    console.error('[discord] Panel button error:', error);
    await mirror.refreshPanel();
  }
}

async function loginDiscord() {
  if (!config.discordToken) {
    console.error('[discord] Missing DISCORD_TOKEN (or TOKEN). Set it in Railway Variables.');
    if (!config.onRailway) {
      process.exit(1);
    }
    return;
  }

  try {
    await client.login(config.discordToken);
  } catch (error) {
    if (!/disallowed intents/i.test(error.message)) {
      console.error('[discord] Login failed:', error.message);
      if (!config.onRailway) {
        process.exit(1);
      }
      return;
    }

    console.error('[discord] Message Content bloqueado. Liga o intent no portal para !play no chat. A entrar sem ele.');
    client.destroy();
    client = createDiscordClient(false);
    bindDiscord(client);
    try {
      await client.login(config.discordToken);
    } catch (retryError) {
      console.error('[discord] Login failed:', retryError.message);
      if (!config.onRailway) {
        process.exit(1);
      }
    }
  }
}

loginDiscord();

process.on('SIGINT', () => {
  mirror.leave();
  client.destroy();
  process.exit(0);
});
