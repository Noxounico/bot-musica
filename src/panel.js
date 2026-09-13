const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} = require('discord.js');
const { seekJumpOptions } = require('./seek');
const { sliderPng } = require('./slider');

function formatClock(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function progressBar(progressMs, durationMs) {
  const width = 18;
  if (!durationMs) {
    return '●' + '─'.repeat(width - 1);
  }
  const ratio = Math.min(1, Math.max(0, progressMs / durationMs));
  const index = Math.round(ratio * (width - 1));
  return `${'─'.repeat(index)}●${'─'.repeat(width - 1 - index)}`;
}

function volumeBar(percent) {
  const width = 8;
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = Math.round((clamped / 100) * width);
  return `${'▰'.repeat(filled)}${'▱'.repeat(width - filled)} **${clamped}%**`;
}

function suggestionValue(track) {
  if (track?.externalUrl && /open\.spotify\.com\/track\//.test(track.externalUrl)) {
    return track.externalUrl.slice(0, 100);
  }
  if (track?.trackId && /^[A-Za-z0-9]{22}$/.test(track.trackId)) {
    return `spotify:track:${track.trackId}`;
  }
  return String(track?.searchQuery || track?.title || '').slice(0, 100);
}

function buildPanel({
  account,
  spotify,
  lastError,
  channelName,
  queue = [],
  suggestions = [],
  volume = 100,
  playlists = [],
  radio = true,
}) {
  const playing = Boolean(spotify?.isPlaying);
  const queueLength = queue.length;
  const controllerName = account?.displayName || 'NoxMusic';
  const durationLabel = spotify?.durationMs ? formatClock(spotify.durationMs) : '--:--';
  const embed = new EmbedBuilder()
    .setColor(0x9b87f5)
    .setAuthor({
      name: playing ? 'A tocar' : (spotify ? 'Em pausa' : 'NoxMusic'),
      iconURL: account?.imageUrl || undefined,
    })
    .setTitle(
      spotify
        ? `${spotify.artists ? `${spotify.artists} — ` : ''}${spotify.title}`
        : 'NoxMusic',
    )
    .setFooter({
      text: spotify
        ? 'A barra atualiza a cada segundo · menu para saltar'
        : 'Clica Tocar ou escreve !play mtg ficar legal',
    });

  embed.setDescription(
    [
      spotify
        ? [
          `• Pedido por **${controllerName}**`,
          channelName ? `• 🔊 ${channelName}` : null,
          `Fila: ${queueLength} · Volume: ${volume}% · Autoplay: ${radio ? 'on' : 'off'}`,
          `\`${formatClock(spotify.progressMs)}\`  \`${durationLabel}\``,
        ].filter(Boolean).join('\n')
        : [
          `• Pedido por **${controllerName}**`,
          channelName ? `• 🔊 ${channelName}` : null,
          `Fila: ${queueLength} · Volume: ${volume}% · Autoplay: ${radio ? 'on' : 'off'}`,
          'Clica **Tocar** ou escreve `!play mtg ficar legal`. Não precisas do Spotify aberto nem de Premium.',
        ].filter(Boolean).join('\n'),
    ].join('\n'),
  );

  if (spotify?.youtubeUrl) {
    embed.setURL(spotify.youtubeUrl);
  } else if (spotify?.externalUrl) {
    embed.setURL(spotify.externalUrl);
  }

  if (spotify?.albumArt) {
    embed.setThumbnail(spotify.albumArt);
  } else if (account?.imageUrl) {
    embed.setThumbnail(account.imageUrl);
  }

  if (queueLength) {
    embed.addFields({
      name: `Fila · ${queueLength}`,
      value: queue.slice(0, 5).map((track, index) => (
        `**${index + 1}.** ${track.title}${track.artists ? ` — ${track.artists}` : ''}`
      )).join('\n').slice(0, 1024),
      inline: false,
    });
  }

  if (playlists.length) {
    embed.addFields({
      name: 'Playlists',
      value: playlists.map((item) => `**${item.name}** · ${item.tracks.length} faixas`).join('\n').slice(0, 1024),
      inline: true,
    });
  }

  if (suggestions.length) {
    embed.addFields({
      name: 'A seguir',
      value: suggestions.slice(0, 3).map((track) => `• ${track.title} — ${track.artists}`).join('\n').slice(0, 1024),
      inline: true,
    });
  }

  if (lastError) {
    embed.addFields({ name: 'Aviso', value: lastError.slice(0, 1024) });
  }

  const files = [];
  if (spotify) {
    files.push(new AttachmentBuilder(
      sliderPng(spotify.progressMs, spotify.durationMs),
      { name: 'slider.png' },
    ));
    embed.setImage('attachment://slider.png');
  }

  const transport = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('spotify_playpause')
      .setLabel(playing ? 'Pausar' : 'Play')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('spotify_next').setLabel('Skip').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nox_stop').setLabel('Parar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('nox_radio')
      .setLabel(radio ? 'Autoplay on' : 'Autoplay off')
      .setStyle(radio ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nox_play').setLabel('Tocar').setStyle(ButtonStyle.Primary),
  );

  const extra = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('nox_seek_back15').setLabel('−15s').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nox_seek_fwd15').setLabel('+15s').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nox_seek_back30').setLabel('−30s').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nox_seek_fwd30').setLabel('+30s').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('spotify_leave').setLabel('Sair').setStyle(ButtonStyle.Danger),
  );

  const components = [transport, extra];

  const jumps = seekJumpOptions(spotify?.durationMs, spotify?.progressMs);
  if (jumps.length && components.length < 5) {
    components.splice(1, 0, new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('nox_seek_jump')
        .setPlaceholder('Arrastar — escolhe o tempo na música')
        .addOptions(jumps),
    ));
  }

  if (suggestions.length && components.length < 5) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('nox_suggest')
        .setPlaceholder('Tocar uma sugestão agora')
        .addOptions(
          suggestions.slice(0, 5).map((track, index) => ({
            label: String(track.title || 'Música').slice(0, 100),
            description: String(track.artists || 'Spotify').slice(0, 100),
            value: `${index}:${suggestionValue(track)}`.slice(0, 100),
          })),
        ),
    ));
  }

  return { embeds: [embed], components, files };
}

module.exports = {
  buildPanel,
  formatClock,
  progressBar,
  volumeBar,
  suggestionValue,
};
