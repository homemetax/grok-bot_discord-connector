'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { LoopGuard, contextKey } = require('../src/loop-guard');

function guard(nowRef, opts = {}) {
  return new LoopGuard({
    maxBotExchanges: 2,
    windowMs: 1000,
    cooldownMs: 100,
    now: () => nowRef.value,
    ...opts,
  });
}

describe('LoopGuard', () => {
  it('always allows humans and resets the bot chain', () => {
    const now = { value: 0 };
    const g = guard(now);
    const key = contextKey('GrokBot', 'c1');
    assert.equal(g.allow(key, { isBot: false }).allowed, true);
    assert.equal(g.allow(key, { isBot: true }).allowed, true);
    g.record(key);
    g.record(key);
    now.value = 50;
    assert.equal(g.allow(key, { isBot: true }).allowed, false);
    assert.equal(g.allow(key, { isBot: false }).allowed, true);
    now.value = 50;
    assert.equal(g.allow(key, { isBot: true }).allowed, true);
  });

  it('blocks a bot during cooldown', () => {
    const now = { value: 0 };
    const g = guard(now);
    const key = contextKey('GrokBot', 'c1');
    assert.equal(g.allow(key, { isBot: true }).allowed, true);
    g.record(key);
    now.value = 50;
    const denied = g.allow(key, { isBot: true });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'cooldown');
    now.value = 100;
    assert.equal(g.allow(key, { isBot: true }).allowed, true);
  });

  it('caps bot-to-bot exchanges inside the window', () => {
    const now = { value: 0 };
    const g = guard(now, { cooldownMs: 0, maxBotExchanges: 2, windowMs: 1000 });
    const key = contextKey('agent-1', 'c1');
    assert.equal(g.allow(key, { isBot: true }).allowed, true);
    g.record(key);
    now.value = 10;
    assert.equal(g.allow(key, { isBot: true }).allowed, true);
    g.record(key);
    now.value = 20;
    const denied = g.allow(key, { isBot: true });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'cap');
    now.value = 1020;
    assert.equal(g.allow(key, { isBot: true }).allowed, true);
  });

  it('tracks channels/threads independently', () => {
    const now = { value: 0 };
    const g = guard(now, { cooldownMs: 0, maxBotExchanges: 1, windowMs: 1000 });
    const a = contextKey('agent-2', 'channel');
    const b = contextKey('agent-2', 'thread');
    g.record(a);
    assert.equal(g.allow(a, { isBot: true }).allowed, false);
    assert.equal(g.allow(b, { isBot: true }).allowed, true);
  });

  it('tracks agents independently on the same channel', () => {
    const now = { value: 0 };
    const g = guard(now, { cooldownMs: 0, maxBotExchanges: 1 });
    g.record(contextKey('GrokBot', 'c1'));
    assert.equal(g.allow(contextKey('agent-9', 'c1'), { isBot: true }).allowed, true);
  });
});
