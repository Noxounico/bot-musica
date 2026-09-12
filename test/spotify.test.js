const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SpotifyClient, parseSpotifyTrackId } = require('../src/spotify');

test('parseSpotifyTrackId accepts URI and open.spotify URLs', () => {
  assert.equal(parseSpotifyTrackId('spotify:track:11dFghVXANMlKmJXsNCbNl'), '11dFghVXANMlKmJXsNCbNl');
  assert.equal(
    parseSpotifyTrackId('https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl?si=abc'),
    '11dFghVXANMlKmJXsNCbNl',
  );
  assert.equal(
    parseSpotifyTrackId('https://open.spotify.com/intl-pt/track/11dFghVXANMlKmJXsNCbNl'),
    '11dFghVXANMlKmJXsNCbNl',
  );
  assert.equal(parseSpotifyTrackId('bohemian rhapsody'), null);
});

test('SpotifyClient.toTrack maps catalog fields', () => {
  const client = new SpotifyClient({ clientId: null, clientSecret: null });
  const track = client.toTrack({
    id: 'abc',
    name: 'Bohemian Rhapsody',
    artists: [{ name: 'Queen' }],
    album: { images: [{ url: 'https://example.com/art.jpg' }] },
    external_urls: { spotify: 'https://open.spotify.com/track/abc' },
    duration_ms: 354000,
  });
  assert.equal(track.title, 'Bohemian Rhapsody');
  assert.equal(track.artists, 'Queen');
  assert.equal(track.searchQuery, 'Queen - Bohemian Rhapsody');
  assert.equal(track.albumArt, 'https://example.com/art.jpg');
});

test('SpotifyClient requests client_credentials only', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), body: String(opts.body) });
    return {
      ok: true,
      json: async () => ({ access_token: 'token', expires_in: 3600 }),
    };
  };

  try {
    const client = new SpotifyClient({ clientId: 'id', clientSecret: 'secret' });
    const token = await client.getAccessToken();
    assert.equal(token, 'token');
    assert.equal(calls[0].url, 'https://accounts.spotify.com/api/token');
    assert.equal(calls[0].body, 'grant_type=client_credentials');
    assert.ok(!calls[0].body.includes('refresh_token'));
  } finally {
    global.fetch = originalFetch;
  }
});
