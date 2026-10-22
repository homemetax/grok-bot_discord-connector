'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateInbound } = require('../src/inbound');
const { LoopGuard } = require('../src/loop-guard');
const { collectBotRoleIds } = require('../src/mentions');

const BOT = '111111111111111111';
const HUMAN = '222222222222222222';
const OTHER_BOT = '333333333333333333';
const CHANNEL = '100000000000000001';
const ROLE = '444444444444444444';
const GUILD = '555555555555555555';

function policy(over = {}) {
  return {
    agentName: 'miya',
    allowedChannelIds: [CHANNEL],
    enableDms: false,
    botRoleIds: collectBotRoleIds([GUILD, ROLE], GUILD),
    ...over,
  };
}

function event(over = {}) {
  return {
    botUserId: BOT,
    authorId: HUMAN,
    authorIsBot: false,
    isDm: false,
    isSystem: false,
    channelId: CHANNEL,
    parentId: null,
    mentionedUserIds: [BOT],
    mentionedRoleIds: [],
    mentionEveryone: false,
    ...over,
  };
}

describe('evaluateInbound', () => {
  it('ignores the bot\'s own messages even when they mention itself', () => {
    const g = new LoopGuard({ cooldownMs: 0 });
    const result = evaluateInbound(event({ authorId: BOT, mentionedUserIds: [BOT] }), policy(), g);
    assert.equal(result.action, 'ignore');
    assert.equal(result.reason, 'own_message');
  });

  it('forwards a human mention in an allowlisted channel', () => {
    const g = new LoopGuard({ cooldownMs: 0 });
    const result = evaluateInbound(event(), policy(), g);
    assert.equal(result.action, 'forward');
    assert.equal(result.contextKey, 'miya:100000000000000001');
  });

  it('ignores messages that do not mention the bot', () => {
    const g = new LoopGuard();
    const result = evaluateInbound(event({ mentionedUserIds: [] }), policy(), g);
    assert.equal(result.reason, 'not_mentioned');
  });

  it('ignores @everyone without a specific mention', () => {
    const g = new LoopGuard();
    const result = evaluateInbound(
      event({ mentionedUserIds: [], mentionEveryone: true }),
      policy(),
      g,
    );
    assert.equal(result.reason, 'not_mentioned');
  });

  it('ignores DMs when they are disabled', () => {
    const g = new LoopGuard();
    const result = evaluateInbound(event({ isDm: true, channelId: 'dm1' }), policy(), g);
    assert.equal(result.reason, 'dm_disabled');
  });

  it('forwards DMs when enableDms is true', () => {
    const g = new LoopGuard({ cooldownMs: 0 });
    const result = evaluateInbound(
      event({ isDm: true, channelId: 'dm1' }),
      policy({ enableDms: true, allowedChannelIds: [] }),
      g,
    );
    assert.equal(result.action, 'forward');
  });

  it('applies the loop guard to other bots', () => {
    const g = new LoopGuard({ maxBotExchanges: 1, cooldownMs: 0, windowMs: 60_000 });
    const botEvent = event({ authorId: OTHER_BOT, authorIsBot: true });
    const first = evaluateInbound(botEvent, policy(), g);
    assert.equal(first.action, 'forward');
    g.record(first.contextKey);
    const second = evaluateInbound(botEvent, policy(), g);
    assert.equal(second.action, 'ignore');
    assert.equal(second.reason, 'loop_guard_cap');
  });
});
