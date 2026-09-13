const { test } = require('node:test');
const assert = require('node:assert/strict');
const { controllerFromMember, mergeController } = require('../src/account');

test('controllerFromMember uses the 256px Discord avatar on the side', () => {
  const member = {
    id: '99',
    displayName: 'Ghost',
    displayAvatarURL({ size }) {
      return `https://cdn.discordapp.com/avatars/99.png?size=${size}`;
    },
    user: { id: '99', username: 'ghost' },
  };

  assert.deepEqual(controllerFromMember(member), {
    id: '99',
    displayName: 'Ghost',
    imageUrl: 'https://cdn.discordapp.com/avatars/99.png?size=256',
  });
});

test('mergeController keeps the last person who changed the panel', () => {
  const merged = mergeController(
    { id: '1', displayName: 'Nox', imageUrl: 'https://a.png' },
    { id: '2', displayName: 'Ghost', imageUrl: 'https://b.png' },
  );
  assert.equal(merged.displayName, 'Ghost');
  assert.equal(merged.imageUrl, 'https://b.png');
});
