const { SpotifyClient } = require('./spotify');
const { VoiceMirrorPlayer } = require('./player');
const { buildPanel } = require('./panel');
const { extractYouTubeId, fetchOEmbed, watchUrl } = require('./youtube');
const playlists = require('./playlists');
const { resolveClipUrl, publishClip } = require('./clip');
const { mergeController } = require('./account');

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
    this.account = { id: null, displayName: 'NoxMusic', imageUrl: null };
    this.channelName = null;
    this.panelMessage = null;
    this.panelChannel = null;
    this.clipMessage = null;
    this.onTrack = null;
    this.guildId = null;
    this.suggestions = [];
    this.advancing = false;
    this.watchdog = null;

    this.player.onIdle = () => {
      this.next({ fromIdle: true }).catch((error) => {
        this.lastError = error.message;
        console.error('[sync] Auto-next failed:', error.message);
        this.refreshPanel();
      });
    };
  }

  setController(account) {
    this.account = mergeController(this.account, account);
    return this.account;
  }

  async join(channel, account) {
    this.channelName = await this.player.join(channel);
    this.guildId = channel.guild?.id || this.guildId;
    this.setController(account);
    this.lastError = null;
    this.seedIdleSuggestions().then(() => this.refreshPanel()).catch((error) => {
      console.error('[sync] Idle suggestions failed:', error.message);
    });
    return this.channelName;
  }

  leave() {
    this.clearWatchdog();
    this.advancing = false;
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
    this.setController(account);

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
    this.clearWatchdog();
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
    this.armWatchdog(this.current);
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

  async refreshSuggestions(seed = null) {
    const from = seed || this.current;
    if (!from || !this.spotify.enabled()) {
      return;
    }
    const next = await this.spotify.suggestionsFor(from);
    if (next.length) {
      this.suggestions = next;
      await this.refreshPanel();
    }
  }

  async seedIdleSuggestions(seed = null) {
    if (!this.spotify.enabled()) {
      return this.suggestions;
    }

    const from = seed || this.current || this.history[this.history.length - 1] || null;
    if (from && typeof this.spotify.suggestionsFor === 'function') {
      const related = await this.spotify.suggestionsFor(from);
      if (related.length) {
        this.suggestions = related;
        return this.suggestions;
      }
    }

    if (typeof this.spotify.searchTracks === 'function') {
      const query = from?.searchQuery || from?.title || 'top portugal';
      this.suggestions = await this.spotify.searchTracks(query, 5);
    }
    return this.suggestions;
  }

  clearWatchdog() {
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
  }

  armWatchdog(track) {
    this.clearWatchdog();
    const duration = Number(track?.durationMs || 0);
    if (!duration || duration < 5000) {
      return;
    }
    const token = track.trackId;
    this.watchdog = setTimeout(() => {
      if (this.current?.trackId !== token || this.player.isPaused) {
        return;
      }
      this.next({ fromIdle: true }).catch((error) => {
        this.lastError = error.message;
        console.error('[sync] Watchdog next failed:', error.message);
        this.refreshPanel();
      });
    }, duration + 2000);
  }

  async startRadio(account) {
    this.setController(account);

    if (this.current && this.player.currentTrackId) {
      if (this.player.isPaused) {
        return this.resume();
      }
      return this.current;
    }

    if (this.queue.length) {
      return this.next();
    }

    if (this.guildId) {
      const sessao = playlists.get(this.guildId, 'sessao');
      if (sessao?.tracks?.length) {
        return this.playPlaylist('sessao');
      }
    }

    if (!this.suggestions.length) {
      await this.seedIdleSuggestions();
    }

    const first = this.suggestions.shift();
    if (!first) {
      throw new Error('Sem sugestões ainda. Usa `/play` com o nome da música.');
    }

    await this.startTrack(first);
    return first;
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
    if (this.advancing) {
      return null;
    }

    this.advancing = true;
    this.clearWatchdog();
    try {
      if (this.current) {
        this.history.push(this.current);
      }

      for (let attempt = 0; attempt < 6; attempt += 1) {
        let upcoming = this.queue.shift();
        if (!upcoming) {
          upcoming = this.suggestions.shift();
        }
        if (!upcoming) {
          await this.seedIdleSuggestions(this.history[this.history.length - 1]);
          upcoming = this.suggestions.shift();
        }
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
          this.lastError = error.message;
          console.error('[sync] Next track failed:', error.message);
          if (!fromIdle && attempt === 5) {
            throw error;
          }
        }
      }

      this.current = null;
      this.player.quietStop();
      await this.refreshPanel();
      return null;
    } finally {
      this.advancing = false;
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
