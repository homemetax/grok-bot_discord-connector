'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  AuthorDailyLimiter,
  writeJsonAtomic,
  normalizeState,
} = require('../src/author-daily');
const { AUTHOR_DAILY_WINDOW_MS } = require('../src/constants');

const AUTHOR = '222222222222222222';
const OTHER = '333333333333333333';
const EXEMPT = '358829341020520470';
const DAY = AUTHOR_DAILY_WINDOW_MS;

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'author-daily-'));
  return path.join(dir, 'author-daily.json');
}

describe('AuthorDailyLimiter', () => {
  it('treats limit 0 as off and does not record', () => {
    const limiter = new AuthorDailyLimiter({ filePath: null, now: () => 1_000_000 });
    const first = limiter.tryConsume({ agentName: 'miya', authorId: AUTHOR, limit: 0 });
    const second = limiter.tryConsume({ agentName: 'miya', authorId: AUTHOR, limit: 0 });
    assert.equal(first.allowed, true);
    assert.equal(first.reason, 'off');
    assert.equal(second.allowed, true);
    assert.equal(limiter.count('miya', AUTHOR), 0);
  });

  it('allows up to the cap and then rate-limits that author on that agent', () => {
    const limiter = new AuthorDailyLimiter({ filePath: null, now: () => 1_000_000 });
    assert.equal(limiter.tryConsume({ agentName: 'miya', authorId: AUTHOR, limit: 1 }).allowed, true);
    const blocked = limiter.tryConsume({ agentName: 'miya', authorId: AUTHOR, limit: 1 });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'rate_limited');
    assert.equal(limiter.count('miya', AUTHOR), 1);
  });

  it('counts per author and per agent independently', () => {
    const limiter = new AuthorDailyLimiter({ filePath: null, now: () => 1_000_000 });
    assert.equal(limiter.tryConsume({ agentName: 'miya', authorId: AUTHOR, limit: 1 }).allowed, true);
    assert.equal(limiter.tryConsume({ agentName: 'miya', authorId: OTHER, limit: 1 }).allowed, true);
    assert.equal(limiter.tryConsume({ agentName: 'scar', authorId: AUTHOR, limit: 1 }).allowed, true);
    assert.equal(limiter.tryConsume({ agentName: 'miya', authorId: AUTHOR, limit: 1 }).allowed, false);
  });

  it('does not count or block exempt author ids', () => {
    const limiter = new AuthorDailyLimiter({ filePath: null, now: () => 1_000_000 });
    const opts = {
      agentName: 'miya',
      authorId: EXEMPT,
      limit: 1,
      exemptIds: [EXEMPT],
    };
    assert.equal(limiter.tryConsume(opts).reason, 'exempt');
    assert.equal(limiter.tryConsume(opts).allowed, true);
    assert.equal(limiter.count('miya', EXEMPT), 0);
  });

  it('drops timestamps outside the rolling 24h window', () => {
    let now = 10_000_000;
    const limiter = new AuthorDailyLimiter({ filePath: null, now: () => now });
    assert.equal(limiter.tryConsume({ agentName: 'miya', authorId: AUTHOR, limit: 1 }).allowed, true);
    assert.equal(limiter.tryConsume({ agentName: 'miya', authorId: AUTHOR, limit: 1 }).allowed, false);
    now += DAY;
    assert.equal(limiter.tryConsume({ agentName: 'miya', authorId: AUTHOR, limit: 1 }).allowed, true);
    assert.equal(limiter.count('miya', AUTHOR), 1);
  });

  it('persists counts so a new instance reloads them', () => {
    const file = tmpFile();
    const now = 20_000_000;
    const first = new AuthorDailyLimiter({ filePath: file, now: () => now });
    assert.equal(first.tryConsume({ agentName: 'miya', authorId: AUTHOR, limit: 1 }).allowed, true);
    assert.ok(fs.existsSync(file));
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(parsed.agents.miya[AUTHOR].length, 1);

    const second = new AuthorDailyLimiter({ filePath: file, now: () => now });
    const blocked = second.tryConsume({ agentName: 'miya', authorId: AUTHOR, limit: 1 });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'rate_limited');
  });

  it('writes atomically via temp file + rename and leaves no tmp leftovers', () => {
    const file = tmpFile();
    writeJsonAtomic(file, { version: 1, agents: { miya: { [AUTHOR]: [1] } } });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
      version: 1,
      agents: { miya: { [AUTHOR]: [1] } },
    });
    const leftovers = fs.readdirSync(path.dirname(file)).filter((n) => n.includes('.tmp'));
    assert.deepEqual(leftovers, []);
  });

  it('ignores prototype-polluting keys when loading JSON', () => {
    const polluted = {
      version: 1,
      agents: {
        __proto__: { polluted: true },
        constructor: { foo: [1] },
        miya: { [AUTHOR]: [5], prototype: [9] },
      },
    };
    const state = normalizeState(polluted);
    assert.equal(Object.prototype.polluted, undefined);
    assert.deepEqual(state.agents.miya[AUTHOR], [5]);
    assert.equal(Object.hasOwn(state.agents, '__proto__'), false);
    assert.equal(Object.hasOwn(state.agents, 'constructor'), false);
    assert.equal(Object.hasOwn(state.agents.miya, 'prototype'), false);
  });
});
