const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_PLAYER_URL = 'https://api.spotify.com/v1/me/player';
const SPOTIFY_CURRENT_URL = 'https://api.spotify.com/v1/me/player/currently-playing';

class SpotifyClient {
  constructor({ clientId, clientSecret, refreshToken }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }

  async getAccessToken() {
    const now = Date.now();
    if (this.accessToken && now < this.accessTokenExpiresAt - 30_000) {
      return this.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
    });

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify token refresh failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.accessTokenExpiresAt = Date.now() + data.expires_in * 1000;

    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
    }

    return this.accessToken;
  }

  normalizePlayback(data) {
    const item = data?.item;
    if (!item) {
      return null;
    }

    const artists = (item.artists || []).map((artist) => artist.name).join(', ');

    return {
      trackId: item.id,
      title: item.name,
      artists,
      durationMs: item.duration_ms || 0,
      progressMs: data.progress_ms || 0,
      isPlaying: Boolean(data.is_playing),
      volumePercent: typeof data.device?.volume_percent === 'number'
        ? data.device.volume_percent
        : null,
      searchQuery: `${artists} - ${item.name}`,
    };
  }

  async fetchPlayer(url, token) {
    return fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async getPlaybackState() {
    const token = await this.getAccessToken();
    let response = await this.fetchPlayer(SPOTIFY_PLAYER_URL, token);

    if (response.status === 204) {
      response = await this.fetchPlayer(SPOTIFY_CURRENT_URL, token);
    }

    if (response.status === 204) {
      return null;
    }

    if (response.status === 403) {
      throw new Error(
        'O Spotify recusou o playback (403). A conta que autorizaste precisa de Premium e de ter música a tocar.',
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify playback request failed (${response.status}): ${text}`);
    }

    return this.normalizePlayback(await response.json());
  }
}

module.exports = { SpotifyClient };
