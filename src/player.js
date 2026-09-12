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
} = require('@discordjs/voice');
const play = require('play-dl');

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

    this.player.on('error', (error) => {
      console.error('[player] Audio player error:', error.message);
      this.loading = false;
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.loading = false;
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
    });
    this.channelId = channel.id;
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

  leave() {
    this.player.stop(true);
    this.currentTrackId = null;
    this.currentQuery = null;
    this.isPaused = false;
    this.loading = false;

    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
    this.channelId = null;
  }

  isConnected() {
    return Boolean(this.connection);
  }

  setVolume(percent) {
    if (typeof percent !== 'number' || Number.isNaN(percent)) {
      return;
    }

    const clamped = Math.max(0, Math.min(100, percent));
    this.volume = clamped / 100;

    const resource = this.player.state.resource;
    if (resource?.volume) {
      resource.volume.setVolume(this.volume);
    }
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

  async playTrack({ trackId, searchQuery, progressMs = 0 }) {
    if (!this.isConnected()) {
      return;
    }

    if (this.loading) {
      return;
    }

    const sameTrack = this.currentTrackId === trackId;
    if (sameTrack && !this.isPaused && this.player.state.status === AudioPlayerStatus.Playing) {
      return;
    }

    if (sameTrack && this.isPaused) {
      this.resume();
      return;
    }

    this.loading = true;
    this.player.stop(true);

    try {
      const url = await this.resolveYouTubeUrl(searchQuery);
      const seekSeconds = Math.max(0, Math.floor(progressMs / 1000));
      const stream = await play.stream(url, { seek: seekSeconds });

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
      console.error(`[player] Failed to play "${searchQuery}":`, error.message);
      this.currentTrackId = null;
      this.currentQuery = null;
    } finally {
      this.loading = false;
    }
  }

  async resolveYouTubeUrl(query) {
    const results = await play.search(query, { limit: 3, source: { youtube: 'video' } });
    if (!results.length) {
      throw new Error(`No YouTube match for "${query}"`);
    }

    for (const result of results) {
      if (result.url) {
        return result.url;
      }
    }

    throw new Error(`No playable URL for "${query}"`);
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
