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

  async playTrack({ trackId, searchQuery, progressMs = 0 }) {
    this.currentTrackId = trackId;
    this.currentQuery = searchQuery;
    this.isPaused = false;
    this.lastProgressMs = progressMs;
    this.lastDurationMs = this.lastDurationMs || 0;
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

test('panel copy tells the user to !play without Premium or an open Spotify app', () => {
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
  assert.match(description, /!play/);
  assert.doesNotMatch(description, /`\/play`/);
  assert.match(description, /não precisas do Spotify aberto nem de Premium/i);
  assert.match(description, /Volume: 70%/);
  assert.match(footer, /!play/);
  assert.deepEqual(
    payload.components[0].components.map((button) => button.data.custom_id),
    ['spotify_playpause', 'spotify_next', 'nox_stop', 'nox_radio', 'nox_play'],
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

test('idle next plays a suggestion when the queue is empty', async () => {
  const { sync, player } = session();
  await sync.playQuery('only track');
  sync.suggestions = [{
    trackId: 'radio-1',
    title: 'Sugestão',
    artists: 'Rádio',
    searchQuery: 'radio hit',
  }];

  const result = await sync.next({ fromIdle: true });
  assert.equal(result.searchQuery, 'radio hit');
  assert.equal(player.currentQuery, 'radio hit');
  assert.equal(sync.current.title, 'Sugestão');
});

test('idle next seeds Spotify suggestions when both queue and list are empty', async () => {
  const player = new FakePlayer();
  const sync = new SpotifyMirrorSync(
    { spotifyClientId: 'id', spotifyClientSecret: 'secret' },
    {
      player,
      spotify: {
        enabled: () => true,
        resolve: async () => null,
        suggestionsFor: async (track) => {
          const label = track.searchQuery || track.title;
          if (/segue sozinha/.test(label)) {
            return [];
          }
          assert.match(label, /only track/);
          return [{
            trackId: 'seed-1',
            title: 'Segue sozinha',
            artists: 'Rádio',
            searchQuery: 'segue sozinha',
          }];
        },
        searchTracks: async () => [],
      },
    },
  );

  sync.current = {
    trackId: 'only',
    title: 'only track',
    searchQuery: 'only track',
    artists: 'YouTube',
  };
  player.currentTrackId = 'only';
  const result = await sync.next({ fromIdle: true });
  assert.equal(result.title, 'Segue sozinha');
  assert.equal(player.currentQuery, 'segue sozinha');
});

test('startRadio plays the first suggestion and stores the controller', async () => {
  const { sync, player } = session();
  sync.suggestions = [{
    trackId: 'radio-2',
    title: 'Auto',
    artists: 'Rádio',
    searchQuery: 'auto play',
  }];

  const started = await sync.startRadio({
    id: 'user-1',
    displayName: 'Ghost',
    imageUrl: 'https://cdn.discordapp.com/avatars/ghost.png',
  });

  assert.equal(started.searchQuery, 'auto play');
  assert.equal(player.currentQuery, 'auto play');
  assert.equal(sync.account.displayName, 'Ghost');
  assert.equal(sync.account.imageUrl, 'https://cdn.discordapp.com/avatars/ghost.png');
});

test('startRadio resumes a paused track instead of skipping', async () => {
  const { sync, player } = session();
  await sync.playQuery('paused song');
  await sync.pause();
  await sync.startRadio({ displayName: 'Nox' });
  assert.equal(player.isPaused, false);
  assert.equal(player.currentQuery, 'paused song');
});

test('panel puts the controller avatar on the side', () => {
  const payload = buildPanel({
    account: {
      displayName: 'Ghost',
      imageUrl: 'https://cdn.discordapp.com/avatars/ghost.png',
    },
    spotify: {
      title: 'TA PEDINDO TOMA',
      artists: 'MC Leozinho',
      isPlaying: true,
      progressMs: 1000,
      durationMs: 180000,
      albumArt: 'https://i.scdn.co/art.jpg',
    },
    lastError: null,
    channelName: 'Geral',
    queue: [],
    suggestions: [{ title: 'Próxima', artists: 'Rádio' }],
    volume: 10,
  });

  const embed = payload.embeds[0].data;
  assert.equal(embed.thumbnail.url, 'https://i.scdn.co/art.jpg');
  assert.equal(embed.image.url, 'attachment://slider.png');
  assert.equal(embed.author.name, 'A tocar');
  assert.equal(embed.title, 'MC Leozinho — TA PEDINDO TOMA');
  assert.match(embed.description, /Pedido por \*\*Ghost\*\*/);
  assert.match(embed.fields.find((field) => field.name === 'A seguir').name, /A seguir/);
  assert.deepEqual(
    payload.components[0].components.map((button) => button.data.custom_id),
    ['spotify_playpause', 'spotify_next', 'nox_stop', 'nox_radio', 'nox_play'],
  );
  assert.equal(payload.components[1].components[0].data.custom_id, 'nox_seek_jump');
  assert.match(payload.components[1].components[0].data.placeholder, /Arrastar/);
  assert.ok(payload.files[0]);
});

test('unknown duration shows --:-- instead of 0:00', () => {
  const payload = buildPanel({
    account: { displayName: 'Nox' },
    spotify: {
      title: 'MTG',
      artists: 'YouTube',
      isPlaying: true,
      progressMs: 83000,
      durationMs: 0,
    },
    lastError: null,
    channelName: 'Geral',
    queue: [],
    volume: 40,
  });
  const description = payload.embeds[0].data.description;
  assert.match(description, /1:23/);
  assert.match(description, /--:--/);
});

test('applies stream duration and refreshes the panel on the ticker', async () => {
  const { sync, player } = session();
  const edits = [];
  sync.attachPanel({
    edit: async (payload) => {
      edits.push(payload.content);
      return payload;
    },
  });
  player.lastDurationMs = 183000;
  await sync.playQuery('tick track');
  assert.equal(sync.current.durationMs, 183000);
  const before = edits.length;
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.ok(edits.length > before);
  sync.stopProgressTicker();
});

test('seekBy and seekTo move playback without changing the track', async () => {
  const { sync, player } = session();
  await sync.playQuery('only track');
  sync.current.durationMs = 180000;
  sync.startedAt = Date.now() - 43000;

  const before = sync.currentState().progressMs;
  const forward = await sync.seekBy(15000);
  assert.equal(player.currentQuery, 'only track');
  assert.equal(player.lastProgressMs, before + 15000);
  assert.ok(Math.abs(forward.progressMs - (before + 15000)) < 50);

  const mid = sync.currentState().progressMs;
  const back = await sync.seekBy(-30000);
  assert.equal(player.lastProgressMs, mid - 30000);
  assert.ok(Math.abs(back.progressMs - (mid - 30000)) < 50);

  const jump = await sync.seekTo(90000);
  assert.equal(player.lastProgressMs, 90000);
  assert.ok(Math.abs(jump.progressMs - 90000) < 50);
});
