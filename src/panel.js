const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

function buildPanel({ account, spotify, lastError, channelName }) {
  const playing = Boolean(spotify?.isPlaying);
  const embed = new EmbedBuilder()
    .setColor(0x1db954)
    .setAuthor({
      name: account?.displayName ? `Spotify · ${account.displayName}` : 'Spotify',
      iconURL: account?.imageUrl || undefined,
      url: 'https://open.spotify.com',
    })
    .setTitle(spotify?.title || 'Nada a tocar')
    .setDescription(
      [
        spotify?.artists || 'Abre o Spotify e mete uma música.',
        spotify
          ? `\`${formatClock(spotify.progressMs)}\` ${progressBar(spotify.progressMs, spotify.durationMs)} \`${formatClock(spotify.durationMs)}\``
          : null,
        channelName ? `Canal: **${channelName}** · fones cortados` : null,
      ].filter(Boolean).join('\n'),
    )
    .setFooter({
      text: playing ? 'A tocar' : (spotify ? 'Em pausa' : 'À espera do Spotify'),
    });

  if (spotify?.albumArt) {
    embed.setThumbnail(spotify.albumArt);
  }
  if (spotify?.externalUrl) {
    embed.setURL(spotify.externalUrl);
  }
  if (lastError) {
    embed.addFields({ name: 'Aviso', value: lastError.slice(0, 1024) });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('spotify_prev').setLabel('⏮').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('spotify_playpause')
      .setLabel(playing ? '⏸' : '▶')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('spotify_next').setLabel('⏭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('spotify_leave').setLabel('Sair').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildPanel, formatClock, progressBar };
