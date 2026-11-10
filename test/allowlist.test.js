'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isChannelAllowed, warnOpenAllowlists } = require('../src/allowlist');

const CHANNEL = '100000000000000001';
const OTHER = '100000000000000002';
const THREAD = '100000000000000003';

describe('isChannelAllowed', () => {
  it('allows a channel that is in the allowlist', () => {
    assert.equal(
      isChannelAllowed(
        { channelId: CHANNEL, isDm: false },
        { allowedChannelIds: [CHANNEL], enableDms: false },
      ),
      true,
    );
  });

  it('allows a thread whose parent is allowlisted', () => {
    assert.equal(
      isChannelAllowed(
        { channelId: THREAD, parentId: CHANNEL, isDm: false },
        { allowedChannelIds: [CHANNEL] },
      ),
      true,
    );
  });

  it('rejects a thread whose parent is not allowlisted', () => {
    assert.equal(
      isChannelAllowed(
        { channelId: THREAD, parentId: OTHER, isDm: false },
        { allowedChannelIds: [CHANNEL] },
      ),
      false,
    );
  });

  it('rejects a guild channel that is not listed', () => {
    assert.equal(
      isChannelAllowed(
        { channelId: OTHER, isDm: false },
        { allowedChannelIds: [CHANNEL] },
      ),
      false,
    );
  });

  it('rejects DMs when enableDms is false', () => {
    assert.equal(
      isChannelAllowed({ channelId: 'dm', isDm: true }, { allowedChannelIds: [CHANNEL], enableDms: false }),
      false,
    );
  });

  it('allows DMs when enableDms is true, regardless of channel allowlist', () => {
    assert.equal(
      isChannelAllowed({ channelId: 'dm', isDm: true }, { allowedChannelIds: ['*'], enableDms: true }),
      true,
    );
  });

  it('allows every guild channel when the allowlist is ["*"]', () => {
    assert.equal(
      isChannelAllowed({ channelId: CHANNEL, isDm: false }, { allowedChannelIds: ['*'], enableDms: false }),
      true,
    );
    assert.equal(
      isChannelAllowed({ channelId: OTHER, isDm: false }, { allowedChannelIds: ['*'], enableDms: false }),
      true,
    );
    assert.equal(
      isChannelAllowed(
        { channelId: THREAD, parentId: OTHER, isDm: false },
        { allowedChannelIds: ['*'] },
      ),
      true,
    );
  });

  it('still rejects DMs when the allowlist is ["*"]', () => {
    assert.equal(
      isChannelAllowed({ channelId: 'dm', isDm: true }, { allowedChannelIds: ['*'], enableDms: false }),
      false,
    );
  });

  it('rejects a guild channel when the allowlist is empty', () => {
    assert.equal(
      isChannelAllowed({ channelId: CHANNEL, isDm: false }, { allowedChannelIds: [], enableDms: false }),
      false,
    );
  });

  it('stringifies snowflakes so number/string ids match', () => {
    assert.equal(
      isChannelAllowed(
        { channelId: 100000000000000001n, isDm: false },
        { allowedChannelIds: ['100000000000000001'] },
      ),
      true,
    );
  });
});

describe('warnOpenAllowlists', () => {
  it('logs one WARN per agent whose allowlist is ["*"]', () => {
    const warns = [];
    warnOpenAllowlists(
      [
        { name: 'GrokBot', allowed_channel_ids: ['*'] },
        { name: 'agent-1', allowed_channel_ids: [CHANNEL] },
        { name: 'agent-2', allowed_channel_ids: ['*'] },
      ],
      { warn: (msg) => warns.push(msg) },
    );
    assert.equal(warns.length, 2);
    assert.match(warns[0], /GrokBot/);
    assert.match(warns[0], /\["\*"]/);
    assert.match(warns[1], /agent-2/);
  });

  it('does not warn for a snowflake allowlist', () => {
    const warns = [];
    warnOpenAllowlists(
      [{ name: 'agent-1', allowed_channel_ids: [CHANNEL] }],
      { warn: (msg) => warns.push(msg) },
    );
    assert.deepEqual(warns, []);
  });
});
