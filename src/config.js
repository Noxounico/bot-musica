require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  discordToken: required('DISCORD_TOKEN'),
  discordClientId: required('DISCORD_CLIENT_ID'),
  discordGuildId: process.env.DISCORD_GUILD_ID || null,
  spotifyClientId: required('SPOTIFY_CLIENT_ID'),
  spotifyClientSecret: required('SPOTIFY_CLIENT_SECRET'),
  spotifyRefreshToken: required('SPOTIFY_REFRESH_TOKEN'),
  pollIntervalMs: Number(process.env.SPOTIFY_POLL_MS || 2000),
};
