function cleanQuery(input) {
  return String(input || '')
    .trim()
    .replace(/^<+|>+$/g, '')
    .replace(/^["'`]+|["'`]+$/g, '');
}

const YOUTUBE_ID_PATTERNS = [
  /youtu\.be\/([A-Za-z0-9_-]{11})/i,
  /youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)([A-Za-z0-9_-]{11})/i,
];

function extractYouTubeId(query) {
  const text = cleanQuery(query);
  for (const pattern of YOUTUBE_ID_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function watchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

function normalizeYouTubeUrl(query) {
  const id = extractYouTubeId(query);
  return id ? watchUrl(id) : null;
}

async function fetchOEmbed(id) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl(id))}&format=json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  return {
    title: data.title || id,
    author: data.author_name || 'YouTube',
    thumbnail: data.thumbnail_url || null,
  };
}

module.exports = {
  cleanQuery,
  extractYouTubeId,
  watchUrl,
  normalizeYouTubeUrl,
  fetchOEmbed,
};
