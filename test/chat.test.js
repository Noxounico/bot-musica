const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldHintUnreadableChat,
  emptyChatHint,
  pickVoiceMember,
  HINT_COOLDOWN_MS,
} = require('../src/chat');
const { idlePlayHint } = require('../src/panel');

test('shouldHintUnreadableChat only fires for empty chat in the same voice or panel', () => {
  assert.equal(shouldHintUnreadableChat({
    content: '!play mtg',
    authorInVoice: true,
    authorChannelId: 'vc-1',
    botChannelId: 'vc-1',
  }), false);

  assert.equal(shouldHintUnreadableChat({
    content: '',
    authorInVoice: true,
    authorChannelId: 'vc-1',
    botChannelId: 'vc-1',
  }), true);

  assert.equal(shouldHintUnreadableChat({
    content: '',
    authorInVoice: true,
    authorChannelId: 'vc-1',
    botChannelId: 'vc-2',
  }), false);

  assert.equal(shouldHintUnreadableChat({
    content: '',
    authorInVoice: true,
    authorChannelId: 'vc-1',
    botChannelId: 'vc-2',
    inPanelChannel: true,
  }), true);

  assert.equal(shouldHintUnreadableChat({
    content: '',
    authorInVoice: true,
    authorChannelId: 'vc-1',
    botChannelId: null,
  }), true);

  assert.equal(shouldHintUnreadableChat({
    content: '',
    authorInVoice: false,
    authorChannelId: null,
    botChannelId: 'vc-1',
  }), false);
});

test('shouldHintUnreadableChat respects the per-user cooldown', () => {
  const now = 1_000_000;
  assert.equal(shouldHintUnreadableChat({
    content: '',
    authorInVoice: true,
    authorChannelId: 'vc-1',
    botChannelId: 'vc-1',
    lastHintAt: now - 10_000,
    now,
  }), false);
  assert.equal(shouldHintUnreadableChat({
    content: '',
    authorInVoice: true,
    authorChannelId: 'vc-1',
    botChannelId: 'vc-1',
    lastHintAt: now - HINT_COOLDOWN_MS - 1,
    now,
  }), true);
});

test('emptyChatHint tells the user to click Tocar or mention the bot', () => {
  const text = emptyChatHint({ botId: '1548283020371435570' });
  assert.match(text, /Não consigo ler `!play`/);
  assert.match(text, /<@1548283020371435570> play mtg ficar legal/);
  assert.match(text, /\*\*Tocar\*\*/);
});

test('pickVoiceMember prefers the configured guild when the user is in voice', () => {
  const memberA = { id: 'user-1', voice: { channel: { id: 'vc-a' } } };
  const memberB = { id: 'user-1', voice: { channel: { id: 'vc-b' } } };
  const guilds = [
    {
      id: 'guild-a',
      voiceStates: { cache: { get: () => ({ member: memberA, channel: memberA.voice.channel }) } },
    },
    {
      id: 'guild-b',
      voiceStates: { cache: { get: () => ({ member: memberB, channel: memberB.voice.channel }) } },
    },
  ];

  assert.equal(pickVoiceMember('user-1', guilds, 'guild-b'), memberB);
  assert.equal(pickVoiceMember('nobody', guilds, 'guild-b'), null);
});

test('idlePlayHint changes copy when the bot cannot read chat', () => {
  assert.match(idlePlayHint(true), /!play mtg ficar legal/);
  assert.match(idlePlayHint(false), /@NoxMusic play mtg ficar legal/);
  assert.doesNotMatch(idlePlayHint(false), /escreve `!play/);
});
