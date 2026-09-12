const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SpotifyMirrorSync } = require('../src/sync');
const { buildPanel } = require('../src/panel');

class FakePlayer {
  constructor() {
    this.connection = true;
    this.currentTrackId = null;
    this.currentQuery = null;
    this.isPaused = false;
    this.channelId = 'voice-1';
    this.played = [];
    this.stoppedQuiet = 0;
    this.onIdle = null;
    this.player = { stop() {} };
  }

  isConnected() {
    return Boolean(this.connection);
  }

  async join(channel) {
    this.channelId = channel.id;
    this.connection = true;
    return channel.name;
  }

  leave() {
    this.quietStop();
    this.connection = null;
  }

  quietStop() {
    this.stoppedQuiet += 1;
    this.currentTrackId = null;
    this.currentQuery = null;
    this.isPaused = false;
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  async playTrack({ trackId, searchQuery }) {
    this.currentTrackId = trackId;
    this.currentQuery = searchQuery;
    this.isPaused = false;
    this.played.push(searchQuery);
  }

  getVolumePercent() {
    return 80;
  }

  setVolume() {
    return 80;
  }

  adjustVolume() {
    return 80;
  }

  getStatus() {
    return {
      connected: this.isConnected(),
      trackId: this.currentTrackId,
      query: this.currentQuery,
      paused: this.isPaused,
    };
  }
}

function session() {
  const player = new FakePlayer();
  const sync = new SpotifyMirrorSync(
    { spotifyClientId: null, spotifyClientSecret: null },
    { player, spotify: { enabled: () => false } },
  );
  return { player, sync };
}

test('playQuery starts the first track and queues the next', async () => {
  const { sync, player } = session();
  const first = await sync.playQuery('bohemian rhapsody');
  assert.equal(first.queued, false);
  assert.equal(player.played[0], 'bohemian rhapsody');

  const second = await sync.playQuery('another one bites the dust');
  assert.equal(second.queued, true);
  assert.equal(second.position, 1);
  assert.equal(player.played.length, 1);
  assert.equal(sync.queue.length, 1);
});

test('next, previous, pause and resume control the Discord queue only', async () => {
  const { sync, player } = session();
  await sync.playQuery('one');
  await sync.playQuery('two');

  await sync.next();
  assert.equal(player.currentQuery, 'two');

  await sync.previous();
  assert.equal(player.currentQuery, 'one');
  assert.equal(sync.queue[0].searchQuery, 'two');

  await sync.pause();
  assert.equal(player.isPaused, true);
  assert.equal(sync.currentState().isPlaying, false);

  await sync.resume();
  assert.equal(player.isPaused, false);
  assert.equal(sync.currentState().isPlaying, true);
});

test('empty next clears playback without requiring Spotify', async () => {
  const { sync, player } = session();
  await sync.playQuery('only track');
  const result = await sync.next();
  assert.equal(result, null);
  assert.equal(sync.current, null);
  assert.equal(player.stoppedQuiet, 1);
});

test('panel copy tells the user to /play without Premium or an open Spotify app', () => {
  const payload = buildPanel({
    account: { displayName: 'Nox' },
    spotify: null,
    lastError: null,
    channelName: 'Geral',
    queue: [],
    volume: 70,
  });
  const description = payload.embeds[0].data.description;
  const footer = payload.embeds[0].data.footer.text;
  assert.match(description, /\/play/);
  assert.match(description, /não precisas do Spotify aberto nem de Premium/i);
  assert.match(description, /70%/);
  assert.match(footer, /À espera de \/play/);
  assert.deepEqual(
    payload.components[0].components.map((button) => button.data.custom_id),
    ['spotify_prev', 'spotify_playpause', 'spotify_next', 'nox_voldown', 'nox_volup'],
  );
});

test('changing track edits the same panel message immediately', async () => {
  const { sync, player } = session();
  const edits = [];
  sync.attachPanel({
    edit: async (payload) => {
      edits.push(payload.content);
      return payload;
    },
  });

  await sync.playQuery('one');
  await sync.playQuery('two', null, { replace: true });

  assert.equal(player.played.at(-1), 'two');
  assert.ok(edits.some((line) => /one/.test(line)));
  assert.ok(edits.some((line) => /two/.test(line)));
  assert.match(edits.at(-1), /two/);
});

test('when a track ends the next queued song starts and the panel changes', async () => {
  const { sync, player } = session();
  const edits = [];
  sync.attachPanel({
    edit: async (payload) => {
      edits.push(payload.content);
      return payload;
    },
  });

  await sync.playQuery('one');
  await sync.playQuery('two');
  assert.equal(player.played.length, 1);

  await sync.next({ fromIdle: true });
  assert.equal(player.played.at(-1), 'two');
  assert.match(edits.at(-1), /two/);
});

test('when the queue is empty idle plays a suggestion', async () => {
  const { sync, player } = session();
  await sync.playQuery('one');
  sync.suggestions = [{
    title: 'sugestao',
    artists: 'Spotify',
    searchQuery: 'sugestao',
    trackId: 'sugestao',
  }];

  await sync.next({ fromIdle: true });
  assert.equal(player.played.at(-1), 'sugestao');
});
