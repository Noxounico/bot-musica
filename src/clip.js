const play = require('play-dl');
const { extractYouTubeId, normalizeYouTubeUrl, watchUrl } = require('./youtube');

function clipQuery(track) {
  if (!track) {
    return '';
  }
  return String(track.searchQuery || `${track.artists || ''} ${track.title || ''}`).trim();
}

function clipUrlFromTrack(track) {
  if (!track) {
    return null;
  }
  return (
    normalizeYouTubeUrl(track.youtubeUrl)
    || normalizeYouTubeUrl(track.searchQuery)
    || normalizeYouTubeUrl(track.externalUrl)
    || (extractYouTubeId(track.trackId) ? watchUrl(track.trackId) : null)
  );
}

async function searchYouTubeClip(query, search = play.search) {
  const text = String(query || '').trim();
  if (!text) {
    return null;
  }
  const normalized = normalizeYouTubeUrl(text);
  if (normalized) {
    return normalized;
  }
  const results = await search(text, { limit: 3, source: { youtube: 'video' } });
  for (const result of results || []) {
    const url = normalizeYouTubeUrl(result.url) || result.url;
    if (url) {
      return url;
    }
  }
  return null;
}

async function resolveClipUrl(track, { search = play.search } = {}) {
  const direct = clipUrlFromTrack(track);
  if (direct) {
    return direct;
  }
  return searchYouTubeClip(clipQuery(track), search);
}

async function publishClip(channel, url, previous) {
  if (!url || !channel) {
    return previous || null;
  }
  const payload = { content: url };
  if (previous && typeof previous.edit === 'function') {
    try {
      return await previous.edit(payload);
    } catch (_) {
      // Message was deleted; send a new one
    }
  }
  if (typeof channel.send !== 'function') {
    return previous || null;
  }
  return channel.send(payload);
}

module.exports = {
  clipQuery,
  clipUrlFromTrack,
  searchYouTubeClip,
  resolveClipUrl,
  publishClip,
};
