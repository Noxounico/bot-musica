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

const missingDiscord = ['DISCORD_TOKEN'].filter(() => !discordToken);

module.exports = {
  discordToken,
  discordClientId,
  discordGuildId,
  spotifyClientId,
  spotifyClientSecret,
  missingDiscord,
  onRailway: Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.PORT),
};
