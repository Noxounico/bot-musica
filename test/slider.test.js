const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sliderPng } = require('../src/slider');

test('sliderPng writes a PNG of the Flavibot-style bar', () => {
  const png = sliderPng(45000, 357000);
  assert.equal(png[0], 0x89);
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.ok(png.length > 80);
});
