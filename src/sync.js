const { SpotifyClient } = require('./spotify');
const { VoiceMirrorPlayer } = require('./player');
const { buildPanel } = require('./panel');

class SpotifyMirrorSync {
  constructor(config, deps = {}) {
    this.spotify = deps.spotify || new SpotifyClient({
      clientId: config.spotifyClientId,
      clientSecret: config.spotifyClientSecret,
    });
    this.player = deps.player || new VoiceMirrorPlayer();
    this.queue = [];
    this.history = [];
    this.current = null;
    this.startedAt = 0;
    this.pausedAt = 0;
    this.lastError = null;
    this.account = { displayName: 'NoxMusic', imageUrl: null };
    this.channelName = null;
    this.panelMessage = null;
    this.onTrack = null;

    this.player.onIdle = () => {
      this.next({ fromIdle: true }).catch((error) => {
        this.lastError = error.message;
        console.error('[sync] Auto-next failed:', error.message);
        this.refreshPanel();
      });
    };
  }

  async join(channel, account) {
    this.channelName = await this.player.join(channel);
    if (account?.displayName) {
      this.account = account;
    }
    this.lastError = null;
    return this.channelName;
  }

  leave() {
    this.queue = [];
    this.history = [];
    this.current = null;
    this.channelName = null;
    const panel = this.panelMessage;
    this.panelMessage = null;
    this.player.leave();
    if (panel) {
      const payload = buildPanel(this.getPanelState());
      payload.components = [];
      panel.edit(payload).catch(() => {});
    }
  }

  attachPanel(message) {
    this.panelMessage = message;
  }

  currentState() {
    if (!this.current) {
      return null;
    }
    const elapsed = this.player.isPaused
      ? this.pausedAt
      : (this.startedAt ? Date.now() - this.startedAt : 0);
    return {
      ...this.current,
      isPlaying: !this.player.isPaused && Boolean(this.player.currentTrackId),
      progressMs: Math.min(this.current.durationMs || elapsed, elapsed),
    };
  }

  getPanelState() {
    return {
      account: this.account,
      spotify: this.currentState(),
      lastError: this.lastError,
      channelName: this.channelName,
      queueLength: this.queue.length,
    };
  }

  panelPayload() {
    return buildPanel(this.getPanelState());
  }

  async refreshPanel() {
    if (!this.panelMessage) {
      return;
    }
    try {
      await this.panelMessage.edit(this.panelPayload());
    } catch (error) {
      console.error('[sync] Panel edit failed:', error.message);
    }
  }

  async resolveTrack(query) {
    const found = this.spotify.enabled() ? await this.spotify.resolve(query) : null;
    return found || {
      trackId: query,
      title: query,
      artists: 'YouTube',
      albumArt: null,
      externalUrl: null,
      durationMs: 0,
      searchQuery: query,
    };
  }

  async playQuery(query, account) {
    if (account?.displayName) {
      this.account = account;
    }

    const track = await this.resolveTrack(query);

    if (this.current && this.player.currentTrackId) {
      this.queue.push(track);
      this.lastError = null;
      await this.refreshPanel();
      return { queued: true, track, position: this.queue.length };
    }

    await this.startTrack(track);
    return { queued: false, track };
  }

  async startTrack(track) {
    this.current = track;
    this.startedAt = Date.now();
    this.pausedAt = 0;
    this.lastError = null;
    try {
      await this.player.playTrack({
        trackId: track.trackId,
        searchQuery: track.searchQuery || `${track.artists} - ${track.title}`,
        progressMs: 0,
      });
    } catch (error) {
      this.lastError = error.message;
      this.current = null;
      await this.refreshPanel();
      throw error;
    }
    if (this.onTrack) {
      this.onTrack(this.currentState());
    }
    await this.refreshPanel();
  }

  pause() {
    if (!this.current) {
      throw new Error('Não há nada a tocar. Usa /play.');
    }
    this.pausedAt = Date.now() - this.startedAt;
    this.player.pause();
    return this.refreshPanel();
  }

  resume() {
    if (!this.current) {
      throw new Error('Não há nada a tocar. Usa /play.');
    }
    this.startedAt = Date.now() - this.pausedAt;
    this.player.resume();
    return this.refreshPanel();
  }

  async next({ fromIdle = false } = {}) {
    if (this.current) {
      this.history.push(this.current);
    }

    const upcoming = this.queue.shift();
    if (!upcoming) {
      this.current = null;
      this.player.quietStop();
      await this.refreshPanel();
      return null;
    }

    try {
      await this.startTrack(upcoming);
      return upcoming;
    } catch (error) {
      if (fromIdle) {
        throw error;
      }
      return this.next({ fromIdle });
    }
  }

  async previous() {
    const previous = this.history.pop();
    if (!previous) {
      throw new Error('Não há faixa anterior.');
    }
    if (this.current) {
      this.queue.unshift(this.current);
    }
    await this.startTrack(previous);
    return previous;
  }

  getStatus() {
    return {
      enabled: this.player.isConnected(),
      spotify: this.currentState(),
      discord: this.player.getStatus(),
      lastError: this.lastError,
      account: this.account,
    };
  }
}

module.exports = { SpotifyMirrorSync };
