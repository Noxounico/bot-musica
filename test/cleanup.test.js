const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isStaleBotMessage, deleteStaleBotMessages } = require('../src/cleanup');

test('keeps the current panel and marks thinking/status messages as stale', () => {
  const botId = 'bot-1';
  const panel = {
    id: 'keep',
    author: { id: botId },
    content: 'A tocar **TA PEDINDO TOMA**',
    components: [{ components: [{ customId: 'spotify_playpause' }] }],
    embeds: [{ title: '🎵  TA PEDINDO TOMA', author: { name: 'NoxMusic' } }],
  };
  const thinking = {
    id: 'old-1',
    author: { id: botId },
    content: '',
    embeds: [],
    components: [],
  };
  const paused = {
    id: 'old-2',
    author: { id: botId },
    content: 'Em pausa — ta pedindo toma',
    embeds: [],
    components: [],
  };
  const other = {
    id: 'other',
    author: { id: 'someone-else' },
    content: 'Em pausa — ta pedindo toma',
    embeds: [],
    components: [],
  };

  assert.equal(isStaleBotMessage(panel, { keepId: 'keep', botId }), false);
  assert.equal(isStaleBotMessage(thinking, { keepId: 'keep', botId }), true);
  assert.equal(isStaleBotMessage(paused, { keepId: 'keep', botId }), true);
  assert.equal(isStaleBotMessage(other, { keepId: 'keep', botId }), false);
});

test('deleteStaleBotMessages removes old NoxMusic panels and keeps the latest', async () => {
  const deleted = [];
  const channel = {
    messages: {
      fetch: async () => new Map([
        ['keep', {
          id: 'keep',
          author: { id: 'bot-1' },
          content: 'A tocar **nova**',
          components: [{ components: [{ customId: 'spotify_next' }] }],
          embeds: [{ author: { name: 'NoxMusic' } }],
          delete: async () => deleted.push('keep'),
        }],
        ['old', {
          id: 'old',
          author: { id: 'bot-1' },
          content: 'Em pausa — ta pedindo toma',
          components: [{ components: [{ customId: 'spotify_prev' }] }],
          embeds: [{ author: { name: 'NoxMusic' } }],
          delete: async () => deleted.push('old'),
        }],
      ]),
    },
  };

  const count = await deleteStaleBotMessages(channel, { keepId: 'keep', botId: 'bot-1' });
  assert.equal(count, 1);
  assert.deepEqual(deleted, ['old']);
});
