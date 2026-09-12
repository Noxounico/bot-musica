const http = require('http');
const { URL } = require('url');
const config = require('./config');
const { getRegistration, COMMAND_NAMES } = require('./commands');

let server = null;

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function page(title, inner) {
  return `<!doctype html>
<html lang="pt">
<head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: sans-serif; background: #111; color: #eee; max-width: 720px; margin: 40px auto; padding: 0 16px; }
  a { color: #1db954; }
  code { background: #222; padding: 2px 6px; border-radius: 6px; }
</style>
</head>
<body>${inner}</body>
</html>`;
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/' || url.pathname === '/health') {
    send(res, 200, 'ok', 'text/plain; charset=utf-8');
    return;
  }

  if (url.pathname === '/commands') {
    send(res, 200, JSON.stringify(getRegistration(), null, 2), 'application/json; charset=utf-8');
    return;
  }

  if (url.pathname === '/spotify' || url.pathname === '/spotify/login' || url.pathname === '/callback') {
    const searchReady = Boolean(config.spotifyClientId && config.spotifyClientSecret);
    send(res, 200, page(
      'NoxMusic',
      `<h1>Já não precisas de login Spotify</h1>
       <p>O bot toca no Discord via YouTube. Não precisas de Premium, da app aberta, nem do scope <code>user-modify-playback-state</code>.</p>
       <p>No Discord: entra num canal de voz e usa <code>/play</code> ou <code>/tocar</code> com o nome da música. Os botões ⏮ ▶/⏸ ⏭ controlam o bot, não o Spotify.</p>
       <p>Comandos do NoxMusic: ${COMMAND_NAMES.map((name) => `<code>/${name}</code>`).join(' ')}</p>
       <p>Spotify Search (arte e título): ${searchReady ? 'Client ID/Secret ok' : 'opcional — o bot toca na mesma sem isto'}.</p>`,
    ));
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

module.exports = { listenForPlatform, handleRequest };
