const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {
  // Node < 17
}

try {
  const ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath) {
    process.env.FFMPEG_PATH = ffmpegPath;
  }
} catch (_) {
  // Aptfile/system ffmpeg is the fallback on Railway
}

const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  AudioPlayerStatus,
  entersState,
  VoiceConnectionStatus,
  StreamType,
  generateDependencyReport,
} = require('@discordjs/voice');
const { Readable } = require('stream');
const play = require('play-dl');
const { extractYouTubeId, normalizeYouTubeUrl } = require('./youtube');

let soundCloudReady = null;

async function ensureSoundCloud() {
  if (!soundCloudReady) {
    soundCloudReady = play.getFreeClientID().then((clientId) => (
      play.setToken({ soundcloud: { client_id: clientId } })
    ));
  }
  await soundCloudReady;
}

console.log('[player] voice dependency report\n' + generateDependencyReport());

class VoiceMirrorPlayer {
  constructor() {
    this.connection = null;
    this.player = createAudioPlayer();
    this.currentTrackId = null;
    this.currentQuery = null;
    this.isPaused = false;
    this.volume = 1;
    this.loading = false;
    this.channelId = null;
    this.joining = null;

    this.ignoreIdle = false;
    this.onIdle = null;
    this.lastYouTubeUrl = null;

    this.player.on('error', (error) => {
      console.error('[player] Audio player error:', error.message);
      this.loading = false;
    });

    this.player.on(AudioPlayerStatus.Playing, () => {
      this.ignoreIdle = false;
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.loading = false;
      if (this.ignoreIdle) {
        return;
      }
      if (typeof this.onIdle === 'function') {
        this.onIdle();
      }
    });
  }

  async join(channel) {
    if (this.joining) {
      return this.joining;
    }

    if (
      this.connection
      && this.channelId === channel.id
      && this.connection.state.status === VoiceConnectionStatus.Ready
    ) {
      return channel.name;
    }

    this.joining = this.joinNow(channel).finally(() => {
      this.joining = null;
    });
    return this.joining;
  }

  async joinNow(channel) {
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
      this.channelId = null;
    }

    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
      daveEncryption: true,
    });
    this.channelId = channel.id;
    this.connection.on('stateChange', (oldState, newState) => {
      console.log(`[player] voice ${oldState.status} -> ${newState.status}`);
    });
    this.connection.on('error', (error) => {
      console.error('[player] voice connection error:', error.message);
    });
    this.connection.subscribe(this.player);

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (error) {
      const status = this.connection?.state?.status;
      this.connection?.destroy();
      this.connection = null;
      this.channelId = null;
      throw new Error(
        `Não consegui entrar no voice (${error.message}${status ? `, estado ${status}` : ''}). Confirma Connect/Speak e tenta outra vez.`,
      );
    }

    return channel.name;
  }

  quietStop() {
    this.ignoreIdle = true;
    this.player.stop(true);
    this.currentTrackId = null;
    this.currentQuery = null;
    this.isPaused = false;
    this.loading = false;
    setTimeout(() => {
      this.ignoreIdle = false;
    }, 500);
  }

  leave() {
    this.quietStop();

    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
    this.channelId = null;
  }

  isConnected() {
    return Boolean(this.connection);
  }

  getVolumePercent() {
    return Math.round(this.volume * 100);
  }

  setVolume(percent) {
    if (typeof percent !== 'number' || Number.isNaN(percent)) {
      return this.getVolumePercent();
    }

    const clamped = Math.max(0, Math.min(100, percent));
    this.volume = clamped / 100;

    const resource = this.player.state.resource;
    if (resource?.volume) {
      resource.volume.setVolume(this.volume);
    }
    return this.getVolumePercent();
  }

  adjustVolume(delta) {
    return this.setVolume(this.getVolumePercent() + Number(delta || 0));
  }

  pause() {
    if (!this.isConnected() || this.isPaused) {
      return;
    }

    this.player.pause();
    this.isPaused = true;
  }

  resume() {
    if (!this.isConnected() || !this.isPaused) {
      return;
    }

    this.player.unpause();
    this.isPaused = false;
  }

  async playTrack({ trackId, searchQuery, youtubeUrl = null, progressMs = 0 }) {
    if (!this.isConnected()) {
      throw new Error('O bot não está num canal de voz. Usa !entrar primeiro.');
    }

    this.loading = true;
    this.ignoreIdle = true;
    this.player.stop(true);

    try {
      const seekSeconds = Math.max(0, Math.floor(progressMs / 1000));
      const stream = await this.openAudioStream({ searchQuery, youtubeUrl, seekSeconds });
      this.lastYouTubeUrl = stream.youtubeUrl || normalizeYouTubeUrl(youtubeUrl || searchQuery);

      const resource = createAudioResource(stream.stream, {
        inputType: stream.type === 'opus' ? StreamType.Opus : StreamType.Arbitrary,
        inlineVolume: true,
      });

      if (resource.volume) {
        resource.volume.setVolume(this.volume);
      }

      this.player.play(resource);
      this.currentTrackId = trackId;
      this.currentQuery = searchQuery;
      this.isPaused = false;
    } catch (error) {
      this.currentTrackId = null;
      this.currentQuery = null;
      throw new Error(`Não consegui tocar "${searchQuery}": ${error.message}`);
    } finally {
      this.loading = false;
      setTimeout(() => {
        this.ignoreIdle = false;
      }, 500);
    }
  }

  async openAudioStream({ searchQuery, youtubeUrl, seekSeconds }) {
    const errors = [];
    const candidates = [];

    const normalized = normalizeYouTubeUrl(youtubeUrl || searchQuery);
    if (normalized) {
      candidates.push(normalized);
    }

    try {
      const searched = await this.searchYouTubeUrl(searchQuery);
      if (searched && !candidates.includes(searched)) {
        candidates.push(searched);
      }
    } catch (error) {
      errors.push(error.message);
    }

    for (const url of candidates) {
      try {
        const stream = await play.stream(url, { seek: seekSeconds });
        return { ...stream, youtubeUrl: url };
      } catch (error) {
        errors.push(`youtube ${error.message}`);
      }

      try {
        const stream = await this.streamWithYtdlp(url);
        return { ...stream, youtubeUrl: url };
      } catch (error) {
        errors.push(`yt-dlp ${error.message}`);
      }
    }

    try {
      const stream = await this.streamFromSoundCloud(searchQuery);
      return { ...stream, youtubeUrl: candidates[0] || null };
    } catch (error) {
      errors.push(`soundcloud ${error.message}`);
    }

    throw new Error(
      'O YouTube recusou o link (share `youtu.be` / bloqueio de bot). Tenta `!play` com o nome da música.',
    );
  }

  async searchYouTubeUrl(query) {
    if (extractYouTubeId(query)) {
      return normalizeYouTubeUrl(query);
    }

    const results = await play.search(query, { limit: 3, source: { youtube: 'video' } });
    for (const result of results) {
      if (result.url) {
        return result.url;
      }
    }
    throw new Error(`Sem resultado no YouTube para "${query}"`);
  }

  async streamWithYtdlp(url) {
    let ytdl;
    try {
      ytdl = require('youtube-dl-exec');
    } catch (error) {
      throw new Error('yt-dlp não está instalado');
    }

    const info = await ytdl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      noPlaylist: true,
      skipDownload: true,
      format: 'bestaudio/best',
    });
    const audioUrl = info.url || info.requested_formats?.find((item) => item.url)?.url;
    if (!audioUrl) {
      throw new Error('yt-dlp não devolveu URL de áudio');
    }

    const response = await fetch(audioUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.body) {
      throw new Error(`áudio HTTP ${response.status}`);
    }

    return { stream: Readable.fromWeb(response.body), type: 'arbitrary' };
  }

  async streamFromSoundCloud(query) {
    await ensureSoundCloud();
    const results = await play.search(query, { limit: 3, source: { soundcloud: 'tracks' } });
    for (const result of results) {
      if (!result.url) {
        continue;
      }
      try {
        return await play.stream(result.url);
      } catch (_) {
        // try the next SoundCloud match
      }
    }
    throw new Error(`Sem áudio no SoundCloud para "${query}"`);
  }

  getStatus() {
    return {
      connected: this.isConnected(),
      trackId: this.currentTrackId,
      query: this.currentQuery,
      paused: this.isPaused,
      playerStatus: this.player.state.status,
      volume: Math.round(this.volume * 100),
    };
  }
}

module.exports = { VoiceMirrorPlayer };
