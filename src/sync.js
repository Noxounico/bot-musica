const { SpotifyClient } = require('./spotify');
const { VoiceMirrorPlayer } = require('./player');

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

    const channelName = await this.player.join(channel);
    this.start();
    return channelName;
  }

  leave() {
    this.stop();
    this.player.leave();
    this.lastState = null;
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
      return;
    }

    if (trackChanged || playStateChanged || !this.lastState) {
      await this.player.playTrack({
        trackId: state.trackId,
        searchQuery: state.searchQuery,
        progressMs: state.progressMs,
      });
    }

    this.lastState = state;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      spotify: this.lastState,
      discord: this.player.getStatus(),
      lastError: this.lastError,
    };
  }
}

module.exports = { SpotifyMirrorSync };
