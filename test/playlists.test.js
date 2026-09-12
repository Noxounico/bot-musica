const { test } = require('node:test');
const assert = require('node:assert/strict');
const playlists = require('../src/playlists');

test('create, add and list playlists per guild', () => {
  const created = playlists.create('guild-1', 'Festa');
  playlists.add('guild-1', 'festa', { title: 'TA PEDINDO TOMA', artists: 'MC Leozinho' });
  const listed = playlists.list('guild-1');
  assert.equal(created.name, 'Festa');
  assert.equal(playlists.get('guild-1', 'FESTA').tracks.length, 1);
  assert.ok(listed.some((item) => item.name === 'Festa'));
});
