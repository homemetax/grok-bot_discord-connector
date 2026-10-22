'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { redact } = require('../src/logger');

describe('redact', () => {
  it('replaces secret env values and keeps the variable name', () => {
    const env = {
      MIYA_DISCORD_TOKEN: 'abcdefghijklmnopqrstuvwxyz',
      MIYA_WEBHOOK_KEY: 'webhookkeyvalue1',
      MIYA_WEBHOOK_URL: 'https://hooks.example.test/abc',
      PATH: '/usr/bin',
    };
    const out = redact('token=abcdefghijklmnopqrstuvwxyz key=webhookkeyvalue1 url=https://hooks.example.test/abc', env);
    assert.equal(out.includes('abcdefghijklmnopqrstuvwxyz'), false);
    assert.equal(out.includes('webhookkeyvalue1'), false);
    assert.match(out, /\[redacted:MIYA_DISCORD_TOKEN\]/);
    assert.match(out, /\[redacted:MIYA_WEBHOOK_KEY\]/);
    assert.match(out, /\[redacted:MIYA_WEBHOOK_URL\]/);
  });
});
