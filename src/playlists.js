const store = new Map();

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function guildMap(guildId) {
  const id = String(guildId || 'global');
  if (!store.has(id)) {
    store.set(id, new Map());
  }
  return store.get(id);
}

function create(guildId, name) {
  const label = String(name || '').trim();
  if (!label) {
    throw new Error('Diz o nome da playlist. Exemplo: `!playlist criar festa`');
  }
  const playlists = guildMap(guildId);
  const key = normalizeName(label);
  if (!playlists.has(key)) {
    playlists.set(key, { name: label, tracks: [] });
  }
  return playlists.get(key);
}

function add(guildId, name, track) {
  if (!track) {
    throw new Error('Não há música para adicionar. Toca uma ou usa `!playlist add nome música`.');
  }
  const playlist = create(guildId, name);
  playlist.tracks.push({ ...track });
  return playlist;
}

function get(guildId, name) {
  return guildMap(guildId).get(normalizeName(name)) || null;
}

function list(guildId) {
  return [...guildMap(guildId).values()];
}

function snapshot(guildId, name, tracks) {
  const playlist = create(guildId, name);
  playlist.tracks = (tracks || []).map((track) => ({ ...track }));
  return playlist;
}

module.exports = { create, add, get, list, snapshot, normalizeName };
