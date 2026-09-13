const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSeekInput, clampSeekMs } = require('../src/seek');

test('parseSeekInput reads relative, clock and seconds', () => {
  assert.deepEqual(parseSeekInput('+15'), { type: 'relative', ms: 15000 });
  assert.deepEqual(parseSeekInput('-30'), { type: 'relative', ms: -30000 });
  assert.deepEqual(parseSeekInput('1:30'), { type: 'absolute', ms: 90000 });
  assert.deepEqual(parseSeekInput('90'), { type: 'absolute', ms: 90000 });
  assert.equal(parseSeekInput(''), null);
  assert.equal(parseSeekInput('abc'), null);
});

test('clampSeekMs keeps the playhead inside the track', () => {
  assert.equal(clampSeekMs(-10, 180000), 0);
  assert.equal(clampSeekMs(200000, 180000), 179500);
  assert.equal(clampSeekMs(5000, 0), 5000);
});
