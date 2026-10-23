'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { splitMessage } = require('../src/split');

describe('splitMessage', () => {
  it('returns a short string unchanged', () => {
    assert.deepEqual(splitMessage('hello'), ['hello']);
  });

  it('returns a string of exactly maxLength as one chunk', () => {
    const text = 'a'.repeat(2000);
    const chunks = splitMessage(text);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].length, 2000);
  });

  it('hard-splits a long string with no whitespace', () => {
    const text = 'a'.repeat(2001);
    const chunks = splitMessage(text);
    assert.equal(chunks.length, 2);
    assert.ok(chunks.every((c) => c.length <= 2000));
    assert.equal(chunks.join(''), text);
  });

  it('prefers a newline break', () => {
    const text = `${'a'.repeat(1500)}\n${'b'.repeat(600)}`;
    const chunks = splitMessage(text);
    assert.equal(chunks.length, 2);
    assert.ok(chunks[0].endsWith('a'));
    assert.ok(chunks[1].startsWith('b'));
    assert.ok(chunks.every((c) => c.length <= 2000));
  });

  it('prefers a space break over a hard cut', () => {
    const text = `${'word '.repeat(400)}end`;
    const chunks = splitMessage(text);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every((c) => c.length <= 2000));
    assert.equal(chunks.join(' ').replace(/ +/g, ' ').trim().startsWith('word'), true);
  });

  it('never returns a chunk longer than maxLength', () => {
    const text = `${'x'.repeat(50)} `.repeat(80);
    const chunks = splitMessage(text, 100);
    assert.ok(chunks.length > 1);
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 100, `chunk length ${chunk.length}`);
    }
  });

  it('returns [""] for nullish input', () => {
    assert.deepEqual(splitMessage(null), ['']);
    assert.deepEqual(splitMessage(undefined), ['']);
  });

  it('throws on non-string input', () => {
    assert.throws(() => splitMessage(123), TypeError);
  });

  it('throws on invalid maxLength', () => {
    assert.throws(() => splitMessage('hi', 0), RangeError);
  });

  it('splits into multiple 2000-char windows', () => {
    const text = 'z'.repeat(5000);
    const chunks = splitMessage(text);
    assert.equal(chunks.reduce((n, c) => n + c.length, 0), 5000);
    assert.ok(chunks.every((c) => c.length <= 2000));
  });
});
