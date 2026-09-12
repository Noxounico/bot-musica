const http = require('http');

let server = null;

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
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[health] listening on ${port}`);
  });

  server.on('error', (error) => {
    console.error('[health] server error:', error.message);
  });

  return server;
}

module.exports = { listenForPlatform };
