require('dotenv').config();

function firstEnv(...names) {
  for (const name of names) {
    const value = typeof process.env[name] === 'string' ? process.env[name].trim() : '';
    if (value) {
      return value;
    }
  }
  return null;
}

const discordToken = firstEnv('DISCORD_TOKEN', 'TOKEN');
const discordClientId = firstEnv('DISCORD_CLIENT_ID', 'CLIENT_ID');
const discordGuildId = firstEnv('DISCORD_GUILD_ID', 'GUILD_ID');
const spotifyClientId = firstEnv('SPOTIFY_CLIENT_ID');
const spotifyClientSecret = firstEnv('SPOTIFY_CLIENT_SECRET');
const spotifyRefreshToken = firstEnv('SPOTIFY_REFRESH_TOKEN');

const missingDiscord = ['DISCORD_TOKEN'].filter(() => !discordToken);
const missingSpotify = [
  !spotifyClientId && 'SPOTIFY_CLIENT_ID',
  !spotifyClientSecret && 'SPOTIFY_CLIENT_SECRET',
  !spotifyRefreshToken && 'SPOTIFY_REFRESH_TOKEN',
].filter(Boolean);

module.exports = {
  discordToken,
  discordClientId,
  discordGuildId,
  spotifyClientId,
  spotifyClientSecret,
  spotifyRefreshToken,
  pollIntervalMs: Number(process.env.SPOTIFY_POLL_MS || 2000),
  missingDiscord,
  missingSpotify,
  onRailway: Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.PORT),
};
