'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isBotMentioned, collectBotRoleIds } = require('../src/mentions');

const BOT = '111111111111111111';
const OTHER = '222222222222222222';
const ROLE_A = '333333333333333333';
const ROLE_B = '444444444444444444';
const GUILD = '555555555555555555';

describe('collectBotRoleIds', () => {
  it('drops the @everyone role (guild id)', () => {
    assert.deepEqual(collectBotRoleIds([GUILD, ROLE_A, ROLE_B], GUILD), [ROLE_A, ROLE_B]);
  });

  it('dedupes and stringifies', () => {
    assert.deepEqual(collectBotRoleIds([ROLE_A, ROLE_A, 333333333333333333n], GUILD), [ROLE_A]);
  });

  it('handles empty input', () => {
    assert.deepEqual(collectBotRoleIds([], GUILD), []);
    assert.deepEqual(collectBotRoleIds(undefined, GUILD), []);
  });
});

describe('isBotMentioned', () => {
  it('returns true when the bot user id is in mentions.users', () => {
    assert.equal(
      isBotMentioned({
        botUserId: BOT,
        mentionedUserIds: [OTHER, BOT],
        mentionedRoleIds: [],
      }),
      true,
    );
  });

  it('returns true when one of the bot roles is in mention_roles', () => {
    assert.equal(
      isBotMentioned({
        botUserId: BOT,
        botRoleIds: collectBotRoleIds([GUILD, ROLE_A], GUILD),
        mentionedUserIds: [],
        mentionedRoleIds: [ROLE_A],
      }),
      true,
    );
  });

  it('returns false for @everyone only', () => {
    assert.equal(
      isBotMentioned({
        botUserId: BOT,
        botRoleIds: collectBotRoleIds([GUILD, ROLE_A], GUILD),
        mentionedUserIds: [],
        mentionedRoleIds: [],
        mentionEveryone: true,
      }),
      false,
    );
  });

  it('returns false for @here only (mentionEveryone without user/role hits)', () => {
    assert.equal(
      isBotMentioned({
        botUserId: BOT,
        botRoleIds: [ROLE_A],
        mentionedUserIds: [],
        mentionedRoleIds: [],
        mentionEveryone: true,
      }),
      false,
    );
  });

  it('still returns true when @everyone is set AND the bot is user-mentioned', () => {
    assert.equal(
      isBotMentioned({
        botUserId: BOT,
        mentionedUserIds: [BOT],
        mentionedRoleIds: [],
        mentionEveryone: true,
      }),
      true,
    );
  });

  it('returns false when some other user is mentioned', () => {
    assert.equal(
      isBotMentioned({
        botUserId: BOT,
        mentionedUserIds: [OTHER],
        mentionedRoleIds: [],
      }),
      false,
    );
  });

  it('returns false when some other role is mentioned', () => {
    assert.equal(
      isBotMentioned({
        botUserId: BOT,
        botRoleIds: [ROLE_A],
        mentionedUserIds: [],
        mentionedRoleIds: [ROLE_B],
      }),
      false,
    );
  });

  it('does not treat the @everyone role id as a bot role mention', () => {
    assert.equal(
      isBotMentioned({
        botUserId: BOT,
        botRoleIds: collectBotRoleIds([GUILD, ROLE_A], GUILD),
        mentionedUserIds: [],
        mentionedRoleIds: [GUILD],
        mentionEveryone: true,
      }),
      false,
    );
  });

  it('returns false without a bot user id', () => {
    assert.equal(isBotMentioned({ mentionedUserIds: [BOT] }), false);
  });

  it('user_or_role (default) still matches a bot role mention', () => {
    assert.equal(
      isBotMentioned({
        botUserId: BOT,
        botRoleIds: [ROLE_A],
        mentionedUserIds: [],
        mentionedRoleIds: [ROLE_A],
        mentionMode: 'user_or_role',
      }),
      true,
    );
  });

  it('user_only ignores role mentions and requires a direct @user mention', () => {
    assert.equal(
      isBotMentioned({
        botUserId: BOT,
        botRoleIds: [ROLE_A],
        mentionedUserIds: [],
        mentionedRoleIds: [ROLE_A],
        mentionMode: 'user_only',
      }),
      false,
    );
    assert.equal(
      isBotMentioned({
        botUserId: BOT,
        botRoleIds: [ROLE_A],
        mentionedUserIds: [BOT],
        mentionedRoleIds: [ROLE_A],
        mentionMode: 'user_only',
      }),
      true,
    );
  });
});
