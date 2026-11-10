'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { handleMessageCreate } = require('../src/handler');
const { postWebhook, formatSenderKey } = require('../src/webhook');
const { LoopGuard } = require('../src/loop-guard');
const { AuthorDailyLimiter } = require('../src/author-daily');
const { cmdReply } = require('../src/cli/messages');

const BOT = '111111111111111111';
const HUMAN = '222222222222222222';
const EXEMPT = '200000000000000001';
const CHANNEL = '100000000000000001';
const OTHER_CHANNEL = '100000000000000099';
const GUILD = '555555555555555555';
const MSG = '999999999999999999';
const KEY = 'test-webhook-key';

/**
 * Local Grok Bot stand-in: 2xx only for Authorization: Bearer <key>.
 * Raw keys and custom headers get 401 (the routine-panel failure mode).
 * @param {{ expectedKey: string }} opts
 */
function startRoutineServer({ expectedKey }) {
  /** @type {any[]} */
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let json = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        json = raw;
      }
      requests.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization || null,
        webhookKey: req.headers['x-webhook-key'] || null,
        contentType: req.headers['content-type'] || null,
        body: json,
      });
      const ok = req.headers.authorization === `Bearer ${expectedKey}`;
      res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(ok ? { ok: true } : { error: 'unauthorized' }));
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('expected a TCP address'));
        return;
      }
      resolve({
        server,
        requests,
        url: `http://127.0.0.1:${addr.port}/hook`,
        close: () =>
          new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}

function mockMessage({ authorId = HUMAN, channelId = CHANNEL, mentioned = true } = {}) {
  return {
    id: MSG,
    partial: false,
    system: false,
    content: 'hello grok',
    guild: {
      id: GUILD,
      members: { me: { roles: { cache: { keys: () => [] } } } },
    },
    channel: {
      id: channelId,
      messages: { fetch: async () => [] },
    },
    author: { id: authorId, bot: false, username: 'alice' },
    mentions: {
      users: { keys: () => (mentioned ? [BOT] : []) },
      roles: { keys: () => [] },
      everyone: false,
    },
    attachments: { values: () => [] },
  };
}

/** @param {any} [opts] */
function mockRuntime({ authorLimiter, agent = {}, env = {}, hookUrl } = {}) {
  const debug = [];
  const info = [];
  const errors = [];
  const limiter = authorLimiter || new AuthorDailyLimiter({ filePath: null, now: () => 1e12 });
  return {
    client: { user: { id: BOT } },
    agent: {
      name: 'GrokBot',
      allowed_channel_ids: ['*'],
      enable_dms: false,
      mention_mode: 'user_only',
      per_author_daily_limit: 0,
      rate_limit_exempt_author_ids: [],
      webhook_url_env: 'GROKBOT_WEBHOOK_URL',
      webhook_key_env: 'GROKBOT_WEBHOOK_KEY',
      webhook_key_header: 'Authorization',
      webhook_timeout_ms: 2000,
      history_limit: 5,
      ...agent,
    },
    loopGuard: new LoopGuard({ cooldownMs: 0 }),
    log: {
      debug: (...a) => debug.push(a.join(' ')),
      info: (...a) => info.push(a.join(' ')),
      warn: () => {},
      error: (...a) =>
        errors.push(
          a
            .map((x) => (x && typeof x === 'object' && x.message ? x.message : String(x)))
            .join(' '),
        ),
    },
    env: {
      GROKBOT_WEBHOOK_URL: hookUrl,
      GROKBOT_WEBHOOK_KEY: KEY,
      ...env,
    },
    authorLimiter: limiter,
    _debug: debug,
    _info: info,
    _errors: errors,
  };
}

describe('inbound smoke (mention -> handler -> local webhook -> reply)', () => {
  it('POSTs Bearer + payload on mention, accepts 2xx, and reply references the message', async () => {
    const srv = await startRoutineServer({ expectedKey: KEY });
    try {
      const runtime = mockRuntime({ hookUrl: srv.url });
      await handleMessageCreate(runtime, mockMessage());

      assert.equal(srv.requests.length, 1);
      const req = srv.requests[0];
      assert.equal(req.method, 'POST');
      assert.equal(req.authorization, `Bearer ${KEY}`);
      assert.equal(req.webhookKey, null);
      assert.match(String(req.contentType), /application\/json/);
      assert.equal(req.body.agent, 'GrokBot');
      assert.equal(req.body.guild_id, GUILD);
      assert.equal(req.body.channel_id, CHANNEL);
      assert.equal(req.body.thread_id, null);
      assert.equal(req.body.msg_id, MSG);
      assert.equal(req.body.author.id, HUMAN);
      assert.equal(req.body.author.name, 'alice');
      assert.equal(req.body.author.is_bot, false);
      assert.equal(req.body.content, 'hello grok');
      assert.ok(Array.isArray(req.body.history));
      assert.ok(Array.isArray(req.body.attachments));
      assert.match(runtime._info.join('\n'), /forwarded 999999999999999999 -> webhook HTTP 200/);

      const restCalls = [];
      const session = {
        call: async (method, route, options) => {
          restCalls.push({ method, route: String(route), options });
          return { id: '888888888888888888' };
        },
      };
      const created = await cmdReply(session, {
        channel: CHANNEL,
        message: MSG,
        content: 'pong',
      });
      assert.equal(created.length, 1);
      assert.equal(restCalls.length, 1);
      assert.equal(restCalls[0].method, 'post');
      assert.equal(restCalls[0].options.body.content, 'pong');
      assert.equal(restCalls[0].options.body.message_reference.message_id, MSG);
      assert.equal(restCalls[0].options.body.message_reference.channel_id, CHANNEL);
      assert.equal(restCalls[0].options.body.message_reference.fail_if_not_exists, false);
      assert.deepEqual(restCalls[0].options.body.allowed_mentions.parse, ['users']);
    } finally {
      await srv.close();
    }
  });
});

describe('webhook header style regressions', () => {
  it('sends Authorization: Bearer, not a raw key', () => {
    assert.equal(formatSenderKey('Authorization', KEY), `Bearer ${KEY}`);
    assert.equal(formatSenderKey('Authorization', `Bearer ${KEY}`), `Bearer ${KEY}`);
    assert.equal(formatSenderKey('X-Webhook-Key', KEY), KEY);
  });

  it('custom header (raw key) is 401 against a Bearer-only routine; Bearer is 2xx', async () => {
    const srv = await startRoutineServer({ expectedKey: KEY });
    try {
      await assert.rejects(
        () =>
          postWebhook({
            url: srv.url,
            key: KEY,
            headerName: 'X-Webhook-Key',
            payload: { agent: 'GrokBot' },
            maxRetries: 3,
            timeoutMs: 2000,
          }),
        (err) => /** @type {any} */ (err).status === 401,
      );
      assert.equal(srv.requests.length, 1);
      assert.equal(srv.requests[0].webhookKey, KEY);
      assert.equal(srv.requests[0].authorization, null);

      const ok = await postWebhook({
        url: srv.url,
        key: KEY,
        headerName: 'Authorization',
        payload: { agent: 'GrokBot' },
        maxRetries: 0,
        timeoutMs: 2000,
      });
      assert.equal(ok.status, 200);
      assert.equal(srv.requests[1].authorization, `Bearer ${KEY}`);
    } finally {
      await srv.close();
    }
  });

  it('handler with X-Webhook-Key logs 401 and does not treat it as forwarded', async () => {
    const srv = await startRoutineServer({ expectedKey: KEY });
    try {
      const runtime = mockRuntime({
        hookUrl: srv.url,
        agent: { webhook_key_header: 'X-Webhook-Key' },
      });
      await handleMessageCreate(runtime, mockMessage());
      assert.equal(srv.requests.length, 1);
      assert.equal(srv.requests[0].authorization, null);
      assert.equal(srv.requests[0].webhookKey, KEY);
      assert.equal(runtime._info.length, 0);
      assert.match(runtime._errors.join('\n'), /401/);
    } finally {
      await srv.close();
    }
  });
});

describe('allowlist and author-limit regressions (through handler)', () => {
  it('["*"] allowed_channel_ids forwards a mention in any guild channel', async () => {
    const srv = await startRoutineServer({ expectedKey: KEY });
    try {
      const runtime = mockRuntime({
        hookUrl: srv.url,
        agent: { allowed_channel_ids: ['*'] },
      });
      await handleMessageCreate(runtime, mockMessage({ channelId: OTHER_CHANNEL }));
      assert.equal(srv.requests.length, 1);
      assert.equal(srv.requests[0].body.channel_id, OTHER_CHANNEL);
    } finally {
      await srv.close();
    }
  });

  it('non-listed channel (and its author) is ignored when allowlist is set', async () => {
    const srv = await startRoutineServer({ expectedKey: KEY });
    try {
      const runtime = mockRuntime({
        hookUrl: srv.url,
        agent: { allowed_channel_ids: [CHANNEL] },
      });
      await handleMessageCreate(runtime, mockMessage({ channelId: OTHER_CHANNEL }));
      assert.equal(srv.requests.length, 0);
      assert.match(runtime._debug.join('\n'), /not_allowlisted/);
    } finally {
      await srv.close();
    }
  });

  it('author who did not mention the bot is ignored', async () => {
    const srv = await startRoutineServer({ expectedKey: KEY });
    try {
      const runtime = mockRuntime({ hookUrl: srv.url });
      await handleMessageCreate(runtime, mockMessage({ mentioned: false }));
      assert.equal(srv.requests.length, 0);
      assert.match(runtime._debug.join('\n'), /not_mentioned/);
    } finally {
      await srv.close();
    }
  });

  it('rate-limit exempt author ids skip the daily cap; others are blocked', async () => {
    const srv = await startRoutineServer({ expectedKey: KEY });
    try {
      const limiter = new AuthorDailyLimiter({ filePath: null, now: () => 1e12 });
      const runtime = mockRuntime({
        hookUrl: srv.url,
        authorLimiter: limiter,
        agent: {
          per_author_daily_limit: 1,
          rate_limit_exempt_author_ids: [EXEMPT],
        },
      });

      await handleMessageCreate(runtime, mockMessage({ authorId: HUMAN }));
      await handleMessageCreate(runtime, mockMessage({ authorId: HUMAN }));
      assert.equal(srv.requests.length, 1);
      assert.match(runtime._debug.join('\n'), /rate_limited/);

      await handleMessageCreate(runtime, mockMessage({ authorId: EXEMPT }));
      await handleMessageCreate(runtime, mockMessage({ authorId: EXEMPT }));
      assert.equal(srv.requests.length, 3);
      assert.equal(limiter.count('GrokBot', EXEMPT), 0);
      assert.equal(limiter.count('GrokBot', HUMAN), 1);
    } finally {
      await srv.close();
    }
  });
});
