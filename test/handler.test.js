'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { handleMessageCreate } = require('../src/handler');
const { LoopGuard } = require('../src/loop-guard');
const { AuthorDailyLimiter } = require('../src/author-daily');

const BOT = '111111111111111111';
const HUMAN = '222222222222222222';
const EXEMPT = '200000000000000001';
const CHANNEL = '100000000000000001';
const GUILD = '555555555555555555';

function mockMessage({ authorId = HUMAN } = {}) {
  return {
    id: '999999999999999999',
    partial: false,
    system: false,
    content: 'hello',
    guild: {
      id: GUILD,
      members: { me: { roles: { cache: { keys: () => [] } } } },
    },
    channel: {
      id: CHANNEL,
      messages: { fetch: async () => [] },
    },
    author: { id: authorId, bot: false, username: 'alice' },
    mentions: {
      users: { keys: () => [BOT] },
      roles: { keys: () => [] },
      everyone: false,
    },
    attachments: { values: () => [] },
  };
}

function mockRuntime({ authorLimiter, agent = {}, env = {} } = {}) {
  const debug = [];
  const limiter = authorLimiter || new AuthorDailyLimiter({ filePath: null, now: () => 1e12 });
  return {
    client: { user: { id: BOT } },
    agent: {
      name: 'GrokBot',
      allowed_channel_ids: [],
      enable_dms: false,
      mention_mode: 'user_only',
      per_author_daily_limit: 1,
      rate_limit_exempt_author_ids: [EXEMPT],
      webhook_url_env: 'GROKBOT_WEBHOOK_URL',
      webhook_key_env: 'GROKBOT_WEBHOOK_KEY',
      webhook_key_header: 'Authorization',
      webhook_timeout_ms: 1000,
      history_limit: 5,
      ...agent,
    },
    loopGuard: new LoopGuard({ cooldownMs: 0 }),
    log: {
      debug: (...a) => debug.push(a.join(' ')),
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    env: {
      GROKBOT_WEBHOOK_URL: 'https://example.test/hook',
      GROKBOT_WEBHOOK_KEY: 'secret-key',
      ...env,
    },
    authorLimiter: limiter,
    _debug: debug,
  };
}

function okFetch() {
  return {
    status: 200,
    ok: true,
    headers: { get: () => null },
    text: async () => '',
  };
}

describe('handleMessageCreate daily limit', () => {
  it('does not POST the webhook or mention Discord when the author is rate limited', async () => {
    const limiter = new AuthorDailyLimiter({ filePath: null, now: () => 1e12 });
    limiter.tryConsume({ agentName: 'GrokBot', authorId: HUMAN, limit: 1 });
    const runtime = mockRuntime({ authorLimiter: limiter });
    let fetches = 0;
    const orig = globalThis.fetch;
    globalThis.fetch = async () => {
      fetches += 1;
      return okFetch();
    };
    try {
      await handleMessageCreate(runtime, mockMessage());
    } finally {
      globalThis.fetch = orig;
    }
    assert.equal(fetches, 0);
    assert.match(runtime._debug.join('\n'), /rate_limited/);
  });

  it('forwards the first mention and then rate-limits the next', async () => {
    const limiter = new AuthorDailyLimiter({ filePath: null, now: () => 1e12 });
    const runtime = mockRuntime({ authorLimiter: limiter });
    let fetches = 0;
    const orig = globalThis.fetch;
    globalThis.fetch = async () => {
      fetches += 1;
      return okFetch();
    };
    try {
      await handleMessageCreate(runtime, mockMessage());
      await handleMessageCreate(runtime, mockMessage());
    } finally {
      globalThis.fetch = orig;
    }
    assert.equal(fetches, 1);
    assert.match(runtime._debug.join('\n'), /rate_limited/);
  });

  it('does not consume quota for an exempt author', async () => {
    const limiter = new AuthorDailyLimiter({ filePath: null, now: () => 1e12 });
    const runtime = mockRuntime({ authorLimiter: limiter });
    let fetches = 0;
    const orig = globalThis.fetch;
    globalThis.fetch = async () => {
      fetches += 1;
      return okFetch();
    };
    try {
      await handleMessageCreate(runtime, mockMessage({ authorId: EXEMPT }));
      await handleMessageCreate(runtime, mockMessage({ authorId: EXEMPT }));
    } finally {
      globalThis.fetch = orig;
    }
    assert.equal(fetches, 2);
    assert.equal(limiter.count('GrokBot', EXEMPT), 0);
  });
});
