const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePrefixCommand,
  parsePlaylistArgs,
  parseChatCommand,
  hint,
  normalizeChatContent,
} = require('../src/prefix');

test('parsePrefixCommand reads name and remaining query', () => {
  assert.deepEqual(parsePrefixCommand('!play bohemian rhapsody'), {
    name: 'play',
    args: 'bohemian rhapsody',
  });
  assert.equal(parsePrefixCommand('/entrar'), null);
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

test('parseChatCommand reads !play and mentions without a slash menu', () => {
  const names = ['play', 'add', 'entrar'];
  assert.deepEqual(
    parseChatCommand('!play mtg ficar legal', { commandNames: names }),
    { name: 'play', args: 'mtg ficar legal' },
  );
  assert.deepEqual(
    parseChatCommand('<@1548283020371435570> !play mtg ficar legal', {
      botId: '1548283020371435570',
      commandNames: names,
    }),
    { name: 'play', args: 'mtg ficar legal' },
  );
  assert.deepEqual(
    parseChatCommand('<@1548283020371435570> mtg ficar legal', {
      botId: '1548283020371435570',
      commandNames: names,
    }),
    { name: 'play', args: 'mtg ficar legal' },
  );
  assert.equal(parseChatCommand('', { commandNames: names }), null);
});

test('normalizeChatContent strips zero-width marks and fullwidth bang', () => {
  assert.equal(normalizeChatContent('\uFEFF!play mtg'), '!play mtg');
  assert.equal(normalizeChatContent('！play mtg ficar legal'), '!play mtg ficar legal');
  assert.equal(normalizeChatContent('!play\u200B mtg'), '!play mtg');
});

test('parseChatCommand reads !play after hidden characters', () => {
  const names = ['play', 'add', 'entrar'];
  assert.deepEqual(
    parseChatCommand('\uFEFF！play mtg ficar legal', { commandNames: names }),
    { name: 'play', args: 'mtg ficar legal' },
  );
});
