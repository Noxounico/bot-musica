const { SpotifyClient } = require('./spotify');
const { VoiceMirrorPlayer } = require('./player');
const { buildPanel } = require('./panel');
const { extractYouTubeId, fetchOEmbed, watchUrl } = require('./youtube');
const playlists = require('./playlists');
const { resolveClipUrl, publishClip } = require('./clip');

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
    this.panelChannel = null;
    this.clipMessage = null;
    this.onTrack = null;
    this.guildId = null;
    this.suggestions = [];

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
    this.guildId = channel.guild?.id || this.guildId;
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
    this.suggestions = [];
    const panel = this.panelMessage;
    this.panelMessage = null;
    this.panelChannel = panel?.channel || this.panelChannel;
    this.player.leave();
    if (panel) {
      const payload = buildPanel(this.getPanelState());
      payload.components = [];
      panel.edit(payload).catch(() => {});
    }
  }

  attachPanel(message) {
    this.panelMessage = message;
    this.panelChannel = message?.channel || this.panelChannel;
  }

  panelContent() {
    const state = this.currentState();
    if (!state) {
      return 'NoxMusic · usa `/play` para começar';
    }
    const label = state.isPlaying ? 'A tocar' : 'Em pausa';
    return `${label} **${state.artists} — ${state.title}**`;
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
      queue: this.queue,
      suggestions: this.suggestions,
      volume: this.player.getVolumePercent ? this.player.getVolumePercent() : 100,
      playlists: this.guildId ? playlists.list(this.guildId) : [],
    };
  }

  panelPayload() {
    return buildPanel(this.getPanelState());
  }

  async refreshPanel() {
    const payload = {
      content: this.panelContent(),
      ...this.panelPayload(),
    };

    const previous = this.panelMessage;
    if (previous) {
      try {
        const edited = await previous.edit(payload);
        if (edited && typeof edited.edit === 'function') {
          this.panelMessage = edited;
        }
        return this.panelMessage;
      } catch (error) {
        console.error('[sync] Panel edit failed:', error.message);
        this.panelMessage = null;
      }
    }

    if (this.panelChannel?.send) {
      try {
        this.panelMessage = await this.panelChannel.send(payload);
        if (previous && previous.id !== this.panelMessage?.id && typeof previous.delete === 'function') {
          await previous.delete().catch(() => {});
        }
        return this.panelMessage;
      } catch (error) {
        console.error('[sync] Panel send failed:', error.message);
      }
    }

    return null;
  }

  async resolveTrack(query) {
    const youtubeId = extractYouTubeId(query);
    if (youtubeId) {
      const meta = await fetchOEmbed(youtubeId);
      if (!meta) {
        throw new Error(
          'Esse link do YouTube não é válido ou o vídeo está indisponível. Usa `/play` com o nome da música, por exemplo `/play TA PEDINDO TOMA`.',
        );
      }
      const spotify = this.spotify.enabled() && typeof this.spotify.searchTrack === 'function'
        ? await this.spotify.searchTrack(`${meta.author} ${meta.title}`)
        : null;
      return {
        trackId: spotify?.trackId || youtubeId,
        title: spotify?.title || meta.title,
        artists: spotify?.artists || meta.author,
        artistId: spotify?.artistId || null,
        albumArt: spotify?.albumArt || meta.thumbnail,
        externalUrl: spotify?.externalUrl || watchUrl(youtubeId),
        durationMs: spotify?.durationMs || 0,
        searchQuery: `${meta.author} - ${meta.title}`,
        youtubeUrl: watchUrl(youtubeId),
      };
    }

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

  async playQuery(query, account, { replace = false } = {}) {
    if (account?.displayName) {
      this.account = account;
    }

    const track = await this.resolveTrack(query);

    if (!replace && this.current && this.player.currentTrackId) {
      this.queue.push(track);
      this.lastError = null;
      await this.refreshPanel();
      return { queued: true, track, position: this.queue.length };
    }

    if (replace && this.current) {
      this.history.push(this.current);
    }

    await this.startTrack(track);
    return { queued: false, track };
  }

  async startTrack(track) {
    this.current = track;
    this.startedAt = Date.now();
    this.pausedAt = 0;
    this.lastError = null;
    this.suggestions = [];
    await this.refreshPanel();
    try {
      await this.player.playTrack({
        trackId: track.trackId,
        searchQuery: track.searchQuery || `${track.artists} - ${track.title}`,
        youtubeUrl: track.youtubeUrl || null,
        progressMs: 0,
      });
      if (this.player.lastYouTubeUrl) {
        this.current.youtubeUrl = this.player.lastYouTubeUrl;
      }
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
    this.refreshSuggestions().catch((error) => {
      console.error('[sync] Suggestions failed:', error.message);
    });
  }

  async showClip(channel) {
    const url = await resolveClipUrl(this.current);
    if (!url) {
      throw new Error('Não encontrei o clipe no YouTube. Tenta `/play` com o nome da música.');
    }
    if (this.current) {
      this.current.youtubeUrl = url;
    }
    this.clipMessage = await publishClip(channel || this.panelChannel, url, this.clipMessage);
    await this.refreshPanel();
    return url;
  }

  async refreshSuggestions() {
    if (!this.current || !this.spotify.enabled()) {
      this.suggestions = [];
      return;
    }
    this.suggestions = await this.spotify.suggestionsFor(this.current);
    await this.refreshPanel();
  }

  adjustVolume(delta) {
    if (typeof this.player.adjustVolume !== 'function') {
      throw new Error('Volume indisponível.');
    }
    this.player.adjustVolume(delta);
    return this.refreshPanel();
  }

  setVolume(percent) {
    if (typeof this.player.setVolume !== 'function') {
      throw new Error('Volume indisponível.');
    }
    this.player.setVolume(percent);
    return this.refreshPanel();
  }

  shuffle() {
    for (let index = this.queue.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [this.queue[index], this.queue[swap]] = [this.queue[swap], this.queue[index]];
    }
    return this.refreshPanel();
  }

  saveSessionPlaylist() {
    const tracks = [this.current, ...this.queue].filter(Boolean);
    if (!tracks.length) {
      throw new Error('Não há músicas para guardar. Usa /play primeiro.');
    }
    const playlist = playlists.snapshot(this.guildId, 'sessao', tracks);
    return playlist;
  }

  async playPlaylist(name) {
    const playlist = playlists.get(this.guildId, name);
    if (!playlist || !playlist.tracks.length) {
      throw new Error(`A playlist **${name}** está vazia. Usa \`/playlist add ${name}\`.`);
    }
    const [first, ...rest] = playlist.tracks.map((track) => ({ ...track }));
    this.queue = rest;
    await this.startTrack(first);
    return playlist;
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
