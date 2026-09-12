const { test } = require('node:test');
const assert = require('node:assert/strict');

test('config does not require a Spotify refresh token or user scopes', () => {
  const config = require('../src/config');
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'spotifyRefreshToken'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'missingSpotify'), false);
});
