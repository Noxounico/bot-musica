const http = require('http');
const { URL } = require('url');
const config = require('./config');
const {
  spotifyRedirectUri,
  authorizeUrl,
  exchangeCode,
  page,
} = require('./spotify-auth-http');

let server = null;

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/' || url.pathname === '/health') {
    send(res, 200, 'ok', 'text/plain; charset=utf-8');
    return;
  }

  if (url.pathname === '/spotify' || url.pathname === '/spotify/login') {
    if (!config.spotifyClientId || !config.spotifyClientSecret) {
      send(res, 500, page(
        'Spotify',
        '<h1>Faltam variáveis</h1><p>Define <code>SPOTIFY_CLIENT_ID</code> e <code>SPOTIFY_CLIENT_SECRET</code> no Railway.</p>',
      ));
      return;
    }

    const redirectUri = spotifyRedirectUri();
    if (!redirectUri) {
      send(res, 500, page(
        'Spotify',
        '<h1>Falta o Redirect URI</h1><p>No Railway, Variables, adiciona <code>SPOTIFY_REDIRECT_URI</code> com <code>https://O-TEU-DOMINIO.up.railway.app/callback</code>. No Spotify Dashboard → Settings, adiciona exactamente o mesmo URI.</p>',
      ));
      return;
    }

    res.writeHead(302, { Location: authorizeUrl(config.spotifyClientId, redirectUri) });
    res.end();
    return;
  }

  if (url.pathname === '/callback') {
    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');

    if (error) {
      send(res, 400, page('Spotify', `<h1>Spotify recusou</h1><p>${error}</p>`));
      return;
    }

    if (!code) {
      send(res, 400, page(
        'Spotify',
        '<h1>Callback sem código</h1><p>Não abras <code>/callback</code> à mão. Vai a <a href="/spotify">/spotify</a> com o servidor a correr.</p>',
      ));
      return;
    }

    const redirectUri = spotifyRedirectUri();
    if (!config.spotifyClientId || !config.spotifyClientSecret || !redirectUri) {
      send(res, 500, page('Spotify', '<h1>Config incompleta</h1><p>Faltam Client ID, Secret ou SPOTIFY_REDIRECT_URI.</p>'));
      return;
    }

    try {
      const tokens = await exchangeCode({
        clientId: config.spotifyClientId,
        clientSecret: config.spotifyClientSecret,
        redirectUri,
        code,
      });

      if (!tokens.refresh_token) {
        send(res, 500, page(
          'Spotify',
          '<h1>Spotify não devolveu refresh token</h1><p>Remove a app em https://www.spotify.com/account/apps/ e tenta outra vez em <a href="/spotify">/spotify</a>.</p>',
        ));
        return;
      }

      console.log('[spotify] Refresh token obtained. Add SPOTIFY_REFRESH_TOKEN in Railway Variables.');
      send(res, 200, page(
        'Spotify ligado',
        `<h1>Spotify ligado</h1>
         <p>Copia isto para o Railway → Variables → <code>SPOTIFY_REFRESH_TOKEN</code> e faz Redeploy:</p>
         <textarea readonly>${tokens.refresh_token}</textarea>`,
      ));
    } catch (err) {
      console.error('[spotify] Token exchange failed:', err.message);
      send(res, 500, page('Spotify', `<h1>Falha ao trocar o código</h1><p>Confirma que o Redirect URI no Spotify Dashboard é exactamente o mesmo que <code>SPOTIFY_REDIRECT_URI</code>.</p>`));
    }
    return;
  }

  send(res, 404, 'not found', 'text/plain; charset=utf-8');
}

/**
 * Railway injects PORT and health-checks it. The original Bot Lusa service
 * listened here; without a listener the replica is marked failed even if
 * Discord login would have succeeded.
 */
function listenForPlatform() {
  if (server) {
    return server;
  }

  const raw = process.env.PORT;
  if (!raw) {
    return null;
  }

  const port = Number(raw);
  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }

  server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error('[health] request error:', error.message);
      if (!res.headersSent) {
        send(res, 500, 'error', 'text/plain; charset=utf-8');
      }
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[health] listening on ${port}`);
  });

  server.on('error', (error) => {
    console.error('[health] server error:', error.message);
  });

  return server;
}

module.exports = { listenForPlatform, handleRequest, spotifyRedirectUri };
