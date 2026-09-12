const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePrefixCommand } = require('../src/prefix');

test('parsePrefixCommand reads name and remaining query', () => {
  assert.deepEqual(parsePrefixCommand('!play bohemian rhapsody'), {
    name: 'play',
    args: 'bohemian rhapsody',
  });
  assert.deepEqual(parsePrefixCommand('/entrar'), { name: 'entrar', args: '' });
  assert.equal(parsePrefixCommand('hello'), null);
});
