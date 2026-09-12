const { SpotifyClient } = require('./spotify');
const { VoiceMirrorPlayer } = require('./player');
const { buildPanel } = require('./panel');

class SpotifyMirrorSync {
  constructor(config) {
    this.pollIntervalMs = config.pollIntervalMs;
    this.spotify = new SpotifyClient({
      clientId: config.spotifyClientId,
      clientSecret: config.spotifyClientSecret,
      refreshToken: config.spotifyRefreshToken,
    });
    this.player = new VoiceMirrorPlayer();
    this.enabled = false;
    this.timer = null;
    this.lastState = null;
    this.lastError = null;
    this.account = null;
    this.channelName = null;
    this.panelMessage = null;
    this.panelTicks = 0;
    this.onTrack = null;
  }

  start() {
    if (this.timer) {
      return;
    }

    this.enabled = true;
    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.lastError = error.message;
        console.error('[sync] Poll error:', error.message);
      });
    }, this.pollIntervalMs);

    this.tick().catch((error) => {
      this.lastError = error.message;
      console.error('[sync] Initial poll error:', error.message);
    });
  }

  stop() {
    this.enabled = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async join(channel) {
    if (!this.spotify.clientId || !this.spotify.clientSecret || !this.spotify.refreshToken) {
      throw new Error(
        'Faltam SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET ou SPOTIFY_REFRESH_TOKEN nas variáveis do Railway.',
      );
    }

    this.channelName = await this.player.join(channel);
    try {
      this.account = await this.spotify.getMe();
    } catch (error) {
      console.error('[sync] Failed to load Spotify profile:', error.message);
    }
    this.start();
    try {
      await this.tick();
    } catch (error) {
      this.lastError = error.message;
      console.error('[sync] Initial poll error:', error.message);
    }
    return this.channelName;
  }

  leave() {
    this.stop();
    this.player.leave();
    this.lastState = null;
    this.channelName = null;
    const panel = this.panelMessage;
    this.panelMessage = null;
    if (panel) {
      const payload = buildPanel(this.getPanelState());
      payload.components = [];
      panel.edit(payload).catch(() => {});
    }
  }

  attachPanel(message) {
    this.panelMessage = message;
  }

  getPanelState() {
    return {
      account: this.account,
      spotify: this.lastState,
      lastError: this.lastError,
      channelName: this.channelName,
    };
  }

  panelPayload() {
    return buildPanel(this.getPanelState());
  }

  async refreshPanel({ force = false } = {}) {
    if (!this.panelMessage) {
      return;
    }

    if (!force) {
      this.panelTicks += 1;
      if (this.panelTicks % 4 !== 0) {
        return;
      }
    }

    try {
      await this.panelMessage.edit(this.panelPayload());
    } catch (error) {
      console.error('[sync] Panel edit failed:', error.message);
    }
  }

  async controlAndRefresh(action) {
    await action();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await this.tick();
    await this.refreshPanel({ force: true });
  }

  pauseSpotify() {
    return this.controlAndRefresh(() => this.spotify.pausePlayback());
  }

  resumeSpotify() {
    return this.controlAndRefresh(() => this.spotify.resumePlayback());
  }

  nextSpotify() {
    return this.controlAndRefresh(() => this.spotify.nextTrack());
  }

  previousSpotify() {
    return this.controlAndRefresh(() => this.spotify.previousTrack());
  }

  async tick() {
    if (!this.enabled || !this.player.isConnected()) {
      return;
    }

    const state = await this.spotify.getPlaybackState();
    this.lastError = null;

    if (!state) {
      if (this.lastState?.isPlaying) {
        this.player.pause();
      }
      this.lastState = null;
      await this.refreshPanel({ force: true });
      return;
    }

    if (state.volumePercent !== null) {
      this.player.setVolume(state.volumePercent);
    }

    const trackChanged = this.lastState?.trackId !== state.trackId;
    const playStateChanged = this.lastState?.isPlaying !== state.isPlaying;

    if (!state.isPlaying) {
      if (this.lastState?.isPlaying || trackChanged) {
        this.player.pause();
      }
      this.lastState = state;
      if (this.onTrack) {
        this.onTrack(state);
      }
      await this.refreshPanel({ force: playStateChanged || trackChanged });
      return;
    }

    if (trackChanged || playStateChanged || !this.lastState) {
      await this.player.playTrack({
        trackId: state.trackId,
        searchQuery: state.searchQuery,
        progressMs: state.progressMs,
      });
      if (this.onTrack) {
        this.onTrack(state);
      }
    }

    this.lastState = state;
    await this.refreshPanel({ force: trackChanged || playStateChanged });
  }

  getStatus() {
    return {
      enabled: this.enabled,
      spotify: this.lastState,
      discord: this.player.getStatus(),
      lastError: this.lastError,
      account: this.account,
    };
  }
}

module.exports = { SpotifyMirrorSync };
