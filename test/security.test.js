'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isChannelAllowed, isThreadChannel } = require('../src/allowlist');
const { describeMessage } = require('../src/handler');
const { postWebhook, capWaitMs } = require('../src/webhook');
const { redact } = require('../src/logger');
const { parseArgs } = require('../src/cli/parse');
const { loadFiles, isDeniedAttachmentPath } = require('../src/cli/files');
const { encodeEmoji } = require('../src/rest');
const { MAX_WEBHOOK_RETRY_AFTER_MS } = require('../src/constants');
const { isDiscordHttpError, wrapDiscordError } = require('../src/discord-error');
const { evaluateInbound } = require('../src/inbound');
const { LoopGuard } = require('../src/loop-guard');

const CHANNEL = '100000000000000001';
const CATEGORY = '100000000000000009';
const THREAD = '100000000000000003';

function jsonResponse(status, body, headers = {}) {
  const h = new Map(Object.entries(headers));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => h.get(name) || h.get(name.toLowerCase()) || null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('allowlist vs category parentId', () => {
  it('does not treat a category child as a thread', () => {
    const text = { id: CHANNEL, parentId: CATEGORY, type: 0, isThread: () => false };
    assert.equal(isThreadChannel(text), false);
    const desc = describeMessage({ guild: { id: '1' }, channel: text });
    assert.equal(desc.isThread, false);
    assert.equal(desc.parentId, null);
    assert.equal(
      isChannelAllowed(
        { channelId: desc.contextChannelId, parentId: desc.parentId, isDm: false },
        { allowedChannelIds: [CATEGORY] },
      ),
      false,
    );
  });

  it('treats forum/thread types as threads even without isThread()', () => {
    assert.equal(isThreadChannel({ id: THREAD, parentId: CHANNEL, type: 11 }), true);
    const desc = describeMessage({
      guild: { id: '1' },
      channel: { id: THREAD, parentId: CHANNEL, type: 11 },
    });
    assert.equal(desc.isThread, true);
    assert.equal(desc.parentId, CHANNEL);
    assert.equal(
      isChannelAllowed(
        { channelId: desc.contextChannelId, parentId: desc.parentId, isDm: false },
        { allowedChannelIds: [CHANNEL] },
      ),
      true,
    );
  });
});

describe('webhook secret handling', () => {
  it('sets redirect=error so the sender key cannot follow a 30x', async () => {
    const calls = [];
    await postWebhook({
      url: 'https://example.test/hook',
      key: 'super-secret-key',
      headerName: 'X-Webhook-Key',
      payload: {},
      fetchImpl: async (url, opts) => {
        calls.push(opts);
        return jsonResponse(200, { ok: true });
      },
      maxRetries: 0,
    });
    assert.equal(calls[0].redirect, 'error');
  });

  it('rejects CR/LF in the sender key (header injection)', async () => {
    await assert.rejects(
      () =>
        postWebhook({
          url: 'https://example.test/hook',
          key: 'secret\r\nX-Injected: 1',
          headerName: 'X-Webhook-Key',
          payload: {},
          fetchImpl: async () => jsonResponse(200, {}),
        }),
      /CR\/LF/,
    );
  });

  it('caps huge retry_after values', () => {
    assert.equal(capWaitMs(3_600_000), MAX_WEBHOOK_RETRY_AFTER_MS);
    const wait = require('../src/webhook').retryAfterMs(
      { headers: { get: () => '3600' } },
      { retry_after: 3600 },
    );
    assert.equal(wait, MAX_WEBHOOK_RETRY_AFTER_MS);
  });
});

describe('logger redacts webhook URLs', () => {
  it('redacts MIYA_WEBHOOK_URL', () => {
    const env = {
      MIYA_WEBHOOK_URL: 'https://hooks.example.test/abc/verysecretpath',
      PATH: '/usr/bin',
    };
    const out = redact('posting to https://hooks.example.test/abc/verysecretpath', env);
    assert.equal(out.includes('verysecretpath'), false);
    assert.match(out, /\[redacted:MIYA_WEBHOOK_URL\]/);
  });
});

describe('CLI flag prototype safety', () => {
  it('rejects __proto__ flag names', () => {
    assert.throws(() => parseArgs(['send', '--__proto__', 'polluted']), /Invalid flag name/);
    const before = {}.polluted;
    parseArgs(['send', '--agent', 'miya']);
    assert.equal({}.polluted, before);
  });
});

describe('attachment secret guard', () => {
  it('denies .env paths', () => {
    assert.equal(isDeniedAttachmentPath('/opt/app/.env'), true);
    assert.equal(isDeniedAttachmentPath('/opt/app/.env.local'), true);
    assert.equal(isDeniedAttachmentPath('/opt/app/shot.png'), false);
  });

  it('refuses to load a file that contains a secret env value', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-discord-'));
    const secretFile = path.join(dir, 'notes.txt');
    fs.writeFileSync(secretFile, 'token=abcdefghijklmnopqrstuvwxyz\n');
    const envFile = path.join(dir, '.env');
    fs.writeFileSync(envFile, 'MIYA_DISCORD_TOKEN=abcdefghijklmnopqrstuvwxyz\n');
    try {
      assert.throws(
        () => loadFiles({ file: envFile }, { MIYA_DISCORD_TOKEN: 'abcdefghijklmnopqrstuvwxyz' }),
        /secret or environment file/,
      );
      assert.throws(
        () => loadFiles({ file: secretFile }, { MIYA_DISCORD_TOKEN: 'abcdefghijklmnopqrstuvwxyz' }),
        /contains a secret environment value/,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('emoji path safety', () => {
  it('rejects path characters that could alter the REST route', () => {
    assert.throws(() => encodeEmoji('../x'), /Invalid emoji/);
    assert.throws(() => encodeEmoji('a/b'), /Invalid emoji/);
    assert.equal(encodeEmoji('👍'), '👍');
    assert.equal(encodeEmoji('<:wave:123456789012345678>'), 'wave:123456789012345678');
  });
});

describe('error paths', () => {
  it('does not treat usage errors as Discord HTTP errors', () => {
    const usage = new Error('Provide --content and/or --file');
    assert.equal(isDiscordHttpError(usage), false);
    const wrapped = wrapDiscordError({ status: 403, rawError: { message: 'Missing Permissions' } });
    assert.equal(isDiscordHttpError(wrapped), true);
  });

  it('ignores events with no author as invalid, not as own_message', () => {
    const result = evaluateInbound(
      {
        botUserId: '1',
        authorId: '',
        authorIsBot: false,
        isDm: false,
        channelId: CHANNEL,
        mentionedUserIds: ['1'],
      },
      { agentName: 'miya', allowedChannelIds: [CHANNEL], enableDms: false, botRoleIds: [] },
      new LoopGuard(),
    );
    assert.equal(result.reason, 'invalid');
  });
});
