const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  clipUrlFromTrack,
  resolveClipUrl,
  publishClip,
} = require('../src/clip');

test('clipUrlFromTrack uses a YouTube watch URL and ignores Spotify links', () => {
  assert.equal(
    clipUrlFromTrack({ youtubeUrl: 'https://youtu.be/mmWZzDPPykI?si=abc' }),
    'https://www.youtube.com/watch?v=mmWZzDPPykI',
  );
  assert.equal(
    clipUrlFromTrack({ externalUrl: 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl' }),
    null,
  );
});

test('resolveClipUrl searches YouTube when the track has no video id', async () => {
  const url = await resolveClipUrl(
    { title: 'TA PEDINDO TOMA', artists: 'MC Leozinho ZS', searchQuery: 'MC Leozinho ZS - TA PEDINDO TOMA' },
    {
      search: async (query) => {
        assert.match(query, /TA PEDINDO TOMA/);
        return [{ url: 'https://www.youtube.com/watch?v=mmWZzDPPykI' }];
      },
    },
  );
  assert.equal(url, 'https://www.youtube.com/watch?v=mmWZzDPPykI');
});

test('publishClip edits the same clip message instead of stacking another', async () => {
  const edits = [];
  const previous = {
    edit: async (payload) => {
      edits.push(payload.content);
      return previous;
    },
  };
  const sent = await publishClip(
    { send: async () => { throw new Error('should edit existing clip'); } },
    'https://www.youtube.com/watch?v=mmWZzDPPykI',
    previous,
  );
  assert.equal(sent, previous);
  assert.deepEqual(edits, ['https://www.youtube.com/watch?v=mmWZzDPPykI']);
});
