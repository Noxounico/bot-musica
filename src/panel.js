const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

function formatClock(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function progressBar(progressMs, durationMs) {
  const width = 14;
  if (!durationMs) {
    return '●' + '▬'.repeat(width - 1);
  }
  const ratio = Math.min(1, Math.max(0, progressMs / durationMs));
  const index = Math.round(ratio * (width - 1));
  return `${'▬'.repeat(index)}●${'▬'.repeat(width - 1 - index)}`;
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
}) {
  const playing = Boolean(spotify?.isPlaying);
  const queueLength = queue.length;
  const controllerName = account?.displayName || 'NoxMusic';
  const embed = new EmbedBuilder()
    .setColor(0x1db954)
    .setAuthor({
      name: `Controlo · ${controllerName}`,
    })
    .setTitle(spotify?.title ? `🎵  ${spotify.title}` : 'NoxMusic')
    .setFooter({
      text: playing
        ? 'A tocar no Discord · sugestões seguem sozinhas · sem Premium'
        : (spotify ? 'Em pausa' : '▶ toca sugestões · /play para escolher · avatar de quem controla ao lado'),
    });

  const links = [];
  if (spotify?.externalUrl) {
    links.push(`[Spotify](${spotify.externalUrl})`);
  }
  if (spotify?.youtubeUrl) {
    links.push(`[Clipe YouTube](${spotify.youtubeUrl})`);
  }

  embed.setDescription(
    [
      `👤 Quem manda: **${controllerName}**`,
      spotify
        ? `**${spotify.artists}**`
        : 'Usa `/play` ou `/add` — nome, link Spotify ou YouTube. Não precisas do Spotify aberto nem de Premium. ▶ no painel toca as sugestões sozinhas.',
      links.length ? links.join('  ·  ') : null,
      spotify
        ? `\`${formatClock(spotify.progressMs)}\` ${progressBar(spotify.progressMs, spotify.durationMs)} \`${formatClock(spotify.durationMs)}\``
        : null,
      `🔊 ${volumeBar(volume)}`,
      channelName ? `🎧 Canal **${channelName}** · fones cortados` : null,
    ].filter(Boolean).join('\n'),
  );

  if (spotify?.youtubeUrl) {
    embed.setURL(spotify.youtubeUrl);
  } else if (spotify?.externalUrl) {
    embed.setURL(spotify.externalUrl);
  }

  if (account?.imageUrl) {
    embed.setThumbnail(account.imageUrl);
  }

  if (spotify?.albumArt) {
    embed.setImage(spotify.albumArt);
  }

  const queueLines = queue.slice(0, 5).map((track, index) => (
    `**${index + 1}.** ${track.title}${track.artists ? ` — ${track.artists}` : ''}`
  ));
  embed.addFields({
    name: queueLength ? `📋 Fila · ${queueLength}` : '📋 Fila',
    value: queueLines.join('\n').slice(0, 1024) || 'Vazia. `/add música` ou escolhe uma sugestão.',
    inline: false,
  });

  if (playlists.length) {
    embed.addFields({
      name: '💿 Playlists',
      value: playlists.map((item) => `**${item.name}** · ${item.tracks.length} faixas`).join('\n').slice(0, 1024),
      inline: false,
    });
  }

  if (suggestions.length) {
    embed.addFields({
      name: '✨ Sugestões · tocam sozinhas',
      value: suggestions.slice(0, 5).map((track) => `• ${track.title} — ${track.artists}`).join('\n').slice(0, 1024),
      inline: false,
    });
  }

  if (lastError) {
    embed.addFields({ name: 'Aviso', value: lastError.slice(0, 1024) });
  }

  const transport = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('spotify_prev').setLabel('⏮').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('spotify_playpause')
      .setLabel(playing ? '⏸' : '▶')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('spotify_next').setLabel('⏭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nox_voldown').setLabel('🔉').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nox_volup').setLabel('🔊').setStyle(ButtonStyle.Secondary),
  );

  const extra = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('nox_save').setLabel('Playlist').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('nox_shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nox_clip').setLabel('Clipe').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('spotify_leave').setLabel('Sair').setStyle(ButtonStyle.Danger),
  );

  const components = [transport, extra];

  if (suggestions.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('nox_suggest')
      .setPlaceholder('Tocar uma sugestão agora')
      .addOptions(
        suggestions.slice(0, 5).map((track, index) => ({
          label: String(track.title || 'Música').slice(0, 100),
          description: String(track.artists || 'Spotify').slice(0, 100),
          value: `${index}:${suggestionValue(track)}`.slice(0, 100),
        })),
      );
    components.push(new ActionRowBuilder().addComponents(menu));
  }

  return { embeds: [embed], components };
}

module.exports = {
  buildPanel,
  formatClock,
  progressBar,
  volumeBar,
  suggestionValue,
};
