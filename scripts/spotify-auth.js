#!/usr/bin/env node
/**
 * One-time helper to obtain a Spotify refresh token.
 * Usage: npm run auth:spotify
 *
 * Add http://localhost:8888/callback as Redirect URI in the Spotify app dashboard.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const { URL } = require('url');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:8888/callback';
const PORT = Number(process.env.SPOTIFY_AUTH_PORT || 8888);

const SCOPES = [
  'user-read-playback-state',
  'user-read-currently-playing',
].join(' ');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in bot-musica/.env first.');
  process.exit(1);
}

function buildAuthUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    show_dialog: 'true',
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400);
    res.end(`Spotify auth error: ${error}`);
    console.error('Spotify auth error:', error);
    server.close();
    process.exit(1);
    return;
  }

  if (!code) {
    res.writeHead(400);
    res.end('Missing code');
    return;
  }

  try {
    const tokens = await exchangeCode(code);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Spotify ligado!</h1><p>Podes fechar esta janela e voltar ao terminal.</p>');

    console.log('\n=== Spotify tokens ===');
    console.log(`SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\nCopia o refresh token para bot-musica/.env e corre npm start.\n');
  } catch (err) {
    res.writeHead(500);
    res.end('Token exchange failed');
    console.error('Token exchange failed:', err.message);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(PORT, () => {
  const authUrl = buildAuthUrl();
  console.log('\n1. Abre este URL no browser (conta Spotify que queres espelhar):\n');
  console.log(authUrl);
  console.log(`\n2. Depois de autorizar, o callback em ${REDIRECT_URI} vai mostrar o refresh token.\n`);
});
