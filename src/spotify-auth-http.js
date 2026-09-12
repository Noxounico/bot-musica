const SCOPES = ['user-read-playback-state', 'user-read-currently-playing'].join(' ');

function spotifyRedirectUri() {
  if (process.env.SPOTIFY_REDIRECT_URI) {
    return process.env.SPOTIFY_REDIRECT_URI;
  }

  const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (domain) {
    return `https://${domain}/callback`;
  }

  return null;
}

function authorizeUrl(clientId, redirectUri) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    show_dialog: 'true',
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

async function exchangeCode({ clientId, clientSecret, redirectUri, code }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text);
  }

  return JSON.parse(text);
}

function page(title, inner) {
  return `<!doctype html>
<html lang="pt">
<head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: sans-serif; background: #111; color: #eee; max-width: 720px; margin: 40px auto; padding: 0 16px; }
  a { color: #1db954; }
  code, textarea { display: block; width: 100%; background: #222; color: #fff; border: 0; padding: 12px; border-radius: 8px; }
  textarea { min-height: 88px; }
</style>
</head>
<body>${inner}</body>
</html>`;
}

module.exports = {
  spotifyRedirectUri,
  authorizeUrl,
  exchangeCode,
  page,
};
