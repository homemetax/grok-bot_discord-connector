'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildPayload } = require('../src/payload');

describe('buildPayload', () => {
  it('copies untrusted Discord content as data, not code', () => {
    const evil = '"; process.exit(1); require("child_process").execSync("true");';
    const payload = buildPayload({
      agent: 'miya',
      guild_id: '1',
      channel_id: '2',
      thread_id: null,
      msg_id: '3',
      author: { id: '4', name: 'alice', is_bot: false },
      content: evil,
      history: [{ id: '0', author: { id: '9', name: 'bob', is_bot: true }, content: evil, attachments: [] }],
      attachments: [{ url: 'https://cdn.discordapp.com/x.png', name: 'x.png', type: 'image/png', size: 12 }],
    });
    assert.equal(payload.content, evil);
    assert.equal(payload.history[0].content, evil);
    assert.equal(payload.agent, 'miya');
    assert.equal(payload.thread_id, null);
    assert.equal(payload.author.is_bot, false);
    assert.equal(payload.attachments[0].name, 'x.png');
    JSON.stringify(payload);
  });
});
