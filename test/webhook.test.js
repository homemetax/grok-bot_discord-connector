'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { postWebhook, formatSenderKey } = require('../src/webhook');
const { buildAllowedMentions } = require('../src/mentions-policy');
const { wrapDiscordError } = require('../src/discord-error');

function jsonResponse(status, body, headers = {}) {
  const h = new Map(Object.entries(headers));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => h.get(name) || h.get(name.toLowerCase()) || null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('postWebhook', () => {
  it('sends JSON with the configured sender-key header', async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, opts });
      return jsonResponse(200, { ok: true });
    };
    await postWebhook({
      url: 'https://example.test/hook',
      key: 'super-secret-key',
      headerName: 'X-Webhook-Key',
      payload: { agent: 'GrokBot' },
      fetchImpl,
      maxRetries: 0,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].opts.headers['X-Webhook-Key'], 'super-secret-key');
    assert.equal(calls[0].opts.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].opts.redirect, 'error');
    assert.equal(JSON.parse(calls[0].opts.body).agent, 'GrokBot');
  });

  it('sends Authorization: Bearer <key> by default style', async () => {
    const calls = [];
    await postWebhook({
      url: 'https://example.test/hook',
      key: 'super-secret-key',
      headerName: 'Authorization',
      payload: {},
      fetchImpl: async (url, opts) => {
        calls.push(opts);
        return jsonResponse(200, { ok: true });
      },
      maxRetries: 0,
    });
    assert.equal(calls[0].headers.Authorization, 'Bearer super-secret-key');
  });

  it('does not double-prefix Bearer', async () => {
    const calls = [];
    await postWebhook({
      url: 'https://example.test/hook',
      key: 'Bearer already-set',
      headerName: 'Authorization',
      payload: {},
      fetchImpl: async (url, opts) => {
        calls.push(opts);
        return jsonResponse(200, { ok: true });
      },
      maxRetries: 0,
    });
    assert.equal(calls[0].headers.Authorization, 'Bearer already-set');
  });

  it('retries 429 using retry_after and does not retry 401', async () => {
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      if (n === 1) {
        return jsonResponse(429, { retry_after: 0.01, message: 'slow down' }, { 'Retry-After': '0.01' });
      }
      return jsonResponse(200, { ok: true });
    };
    await postWebhook({
      url: 'https://example.test/hook',
      key: 'k',
      headerName: 'X-Webhook-Key',
      payload: {},
      fetchImpl,
      maxRetries: 2,
    });
    assert.equal(n, 2);

    await assert.rejects(
      () =>
        postWebhook({
          url: 'https://example.test/hook',
          key: 'k',
          headerName: 'X-Webhook-Key',
          payload: {},
          fetchImpl: async () => jsonResponse(401, { error: 'nope' }),
          maxRetries: 3,
        }),
      (err) => err.status === 401,
    );
  });
});

describe('formatSenderKey', () => {
  it('prefixes Bearer for Authorization and leaves other headers raw', () => {
    assert.equal(formatSenderKey('Authorization', 'abc'), 'Bearer abc');
    assert.equal(formatSenderKey('authorization', 'abc'), 'Bearer abc');
    assert.equal(formatSenderKey('Authorization', 'Bearer abc'), 'Bearer abc');
    assert.equal(formatSenderKey('X-Webhook-Key', 'abc'), 'abc');
  });
});

describe('buildAllowedMentions', () => {
  it('blocks everyone and roles by default', () => {
    const m = buildAllowedMentions({});
    assert.deepEqual(m.parse, ['users']);
    assert.ok(!m.parse.includes('everyone'));
    assert.ok(!m.parse.includes('roles'));
  });

  it('supports --no-mentions', () => {
    assert.deepEqual(buildAllowedMentions({ 'no-mentions': true }).parse, []);
  });
});

describe('wrapDiscordError', () => {
  it('surfaces 403 with role hierarchy guidance', () => {
    const wrapped = wrapDiscordError({
      status: 403,
      rawError: { message: 'Missing Permissions', code: 50013 },
    });
    assert.equal(wrapped.status, 403);
    assert.match(wrapped.message, /Forbidden \(403\)/);
    assert.match(wrapped.message, /role hierarchy/i);
  });
});
