const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePrefixCommand, parsePlaylistArgs, hint } = require('../src/prefix');

test('parsePrefixCommand reads name and remaining query', () => {
  assert.deepEqual(parsePrefixCommand('!play bohemian rhapsody'), {
    name: 'play',
    args: 'bohemian rhapsody',
  });
  assert.deepEqual(parsePrefixCommand('/entrar'), { name: 'entrar', args: '' });
  assert.equal(parsePrefixCommand('hello'), null);
  assert.equal(hint('play'), '!play');
});

test('parsePlaylistArgs reads !playlist subcommands', () => {
  assert.deepEqual(parsePlaylistArgs('criar festa'), { sub: 'criar', name: 'festa', query: null });
  assert.deepEqual(parsePlaylistArgs('add festa uma musica'), {
    sub: 'add',
    name: 'festa',
    query: 'uma musica',
  });
  assert.deepEqual(parsePlaylistArgs('tocar sessao'), { sub: 'tocar', name: 'sessao', query: null });
  assert.deepEqual(parsePlaylistArgs(''), { sub: 'lista', name: null, query: null });
});
