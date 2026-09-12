const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  extractYouTubeId,
  normalizeYouTubeUrl,
  cleanQuery,
} = require('../src/youtube');
const { SpotifyMirrorSync } = require('../src/sync');

test('extracts youtu.be share links with si= and leftover punctuation', () => {
  assert.equal(
    extractYouTubeId('https://youtu.be/mmWZzDPPykI?si=xEehaNSKz5ASqGLK'),
    'mmWZzDPPykI',
  );
  assert.equal(
    extractYouTubeId('https://youtu.be/mmWZzDPPykI!?si=xEehaNSKz5ASqGLK'),
    'mmWZzDPPykI',
  );
  assert.equal(
    extractYouTubeId('<https://youtu.be/mmWZzDPPykI?si=abc>'),
    'mmWZzDPPykI',
  );
  assert.equal(
    extractYouTubeId('"https://youtu.be/mmWZzDPPykI?si=abc"'),
    'mmWZzDPPykI',
  );
});

test('normalizes watch, shorts and embed URLs to youtube.com/watch', () => {
  assert.equal(
    normalizeYouTubeUrl('https://youtu.be/mmWZzDPPykI?si=abc'),
    'https://www.youtube.com/watch?v=mmWZzDPPykI',
  );
  assert.equal(
    normalizeYouTubeUrl('https://www.youtube.com/watch?v=mmWZzDPPykI&list=OLAK5uy'),
    'https://www.youtube.com/watch?v=mmWZzDPPykI',
  );
  assert.equal(
    normalizeYouTubeUrl('https://www.youtube.com/shorts/mmWZzDPPykI'),
    'https://www.youtube.com/watch?v=mmWZzDPPykI',
  );
  assert.equal(normalizeYouTubeUrl('TA PEDINDO TOMA'), null);
});

test('cleanQuery strips Discord angle brackets', () => {
  assert.equal(
    cleanQuery('<https://youtu.be/mmWZzDPPykI>'),
    'https://youtu.be/mmWZzDPPykI',
  );
});

test('resolveTrack maps share links via oEmbed and does not call Spotify', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      title: 'TA PEDINDO TOMA',
      author_name: 'MC Leozinho ZS',
      thumbnail_url: 'https://i.ytimg.com/x.jpg',
    }),
  });

  try {
    const sync = new SpotifyMirrorSync(
      { spotifyClientId: 'id', spotifyClientSecret: 'secret' },
      {
        player: {
          onIdle: null,
          isConnected: () => true,
          currentTrackId: null,
          isPaused: false,
          getStatus: () => ({}),
        },
        spotify: {
          enabled: () => true,
          searchTrack: async () => null,
          resolve: async () => {
            throw new Error('should not search Spotify for YouTube URLs');
          },
        },
      },
    );

    const track = await sync.resolveTrack('https://youtu.be/mmWZzDPPykI?si=xEehaNSKz5ASqGLK');
    assert.equal(track.title, 'TA PEDINDO TOMA');
    assert.equal(track.artists, 'MC Leozinho ZS');
    assert.equal(track.youtubeUrl, 'https://www.youtube.com/watch?v=mmWZzDPPykI');
    assert.match(track.searchQuery, /TA PEDINDO TOMA/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('resolveTrack rejects unavailable YouTube ids with a Portuguese hint', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, json: async () => ({}) });

  try {
    const sync = new SpotifyMirrorSync(
      {},
      {
        player: { onIdle: null, isConnected: () => false, getStatus: () => ({}) },
        spotify: { enabled: () => false },
      },
    );
    await assert.rejects(
      () => sync.resolveTrack('https://youtu.be/mmWZzDPPPyk!?si=abc'),
      /nome da música/,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
