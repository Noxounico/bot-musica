const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

function parseSpotifyTrackId(query) {
  if (!query) {
    return null;
  }
  const uri = String(query).match(/spotify:track:([A-Za-z0-9]+)/i);
  if (uri) {
    return uri[1];
  }
  const url = String(query).match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/i);
  return url ? url[1] : null;
}

class SpotifyClient {
  constructor({ clientId, clientSecret }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }

  enabled() {
    return Boolean(this.clientId && this.clientSecret);
  }

  async getAccessToken() {
    if (!this.enabled()) {
      return null;
    }

    const now = Date.now();
    if (this.accessToken && now < this.accessTokenExpiresAt - 30_000) {
      return this.accessToken;
    }

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });

    if (!response.ok) {
      throw new Error(`Spotify app token failed (${response.status})`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.accessTokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  toTrack(item) {
    if (!item) {
      return null;
    }
    const artists = (item.artists || []).map((artist) => artist.name).join(', ');
    const images = item.album?.images || item.images || [];
    return {
      trackId: item.id || item.name,
      title: item.name,
      artists: artists || 'Desconhecido',
      artistId: item.artists?.[0]?.id || null,
      albumArt: images[0]?.url || images[1]?.url || null,
      externalUrl: item.external_urls?.spotify || null,
      durationMs: item.duration_ms || 0,
      searchQuery: `${artists} - ${item.name}`.replace(/^ - /, ''),
    };
  }

  async getTrack(id) {
    const token = await this.getAccessToken();
    if (!token) {
      return null;
    }
    const response = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return null;
    }
    return this.toTrack(await response.json());
  }

  async searchTracks(query, limit = 5) {
    const token = await this.getAccessToken();
    if (!token) {
      return [];
    }
    const url = new URL('https://api.spotify.com/v1/search');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'track');
    url.searchParams.set('limit', String(Math.max(1, Math.min(10, limit))));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return (data.tracks?.items || []).map((item) => this.toTrack(item)).filter(Boolean);
  }

  async searchTrack(query) {
    const [track] = await this.searchTracks(query, 1);
    return track || null;
  }

  async suggestionsFor(track) {
    const token = await this.getAccessToken();
    if (!token || !track) {
      return [];
    }

    if (track.artistId) {
      const response = await fetch(
        `https://api.spotify.com/v1/artists/${track.artistId}/top-tracks?market=PT`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.ok) {
        const data = await response.json();
        return (data.tracks || [])
          .map((item) => this.toTrack(item))
          .filter((item) => item && item.trackId !== track.trackId)
          .slice(0, 5);
      }
    }

    const query = [track.artists, track.title].filter(Boolean).join(' ');
    return (await this.searchTracks(query || track.title, 6))
      .filter((item) => item.trackId !== track.trackId)
      .slice(0, 5);
  }

  async resolve(query) {
    const id = parseSpotifyTrackId(query);
    if (id) {
      return this.getTrack(id);
    }
    return this.searchTrack(query);
  }
}

module.exports = { SpotifyClient, parseSpotifyTrackId };
