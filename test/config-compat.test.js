'use strict';

// Regression: zod ConfigSchema keeps dev's null / "" fallbacks (PR #15).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig } = require('../src/config');
const {
  DEFAULT_DATA_DIR,
  DEFAULT_MENTION_MODE,
  DEFAULT_WEBHOOK_KEY_HEADER,
} = require('../src/constants');

const agent = {
  name: 'agent-1',
  token_env: 'AGENT_1_DISCORD_TOKEN',
  webhook_url_env: 'AGENT_1_WEBHOOK_URL',
  webhook_key_env: 'AGENT_1_WEBHOOK_KEY',
};

describe('config null / "" fallbacks match dev', () => {
  for (const blank of [null, '']) {
    const label = JSON.stringify(blank);

    it(`top-level mention_mode ${label} uses the default`, () => {
      const cfg = normalizeConfig({ mention_mode: blank, agents: [agent] });
      assert.equal(cfg.mention_mode, DEFAULT_MENTION_MODE);
      assert.equal(cfg.agents[0].mention_mode, DEFAULT_MENTION_MODE);
    });

    it(`agent mention_mode ${label} uses the built-in default`, () => {
      const cfg = normalizeConfig({
        mention_mode: 'user_only',
        agents: [{ ...agent, mention_mode: blank }],
      });
      assert.equal(cfg.mention_mode, 'user_only');
      assert.equal(cfg.agents[0].mention_mode, DEFAULT_MENTION_MODE);
    });

    it(`data_dir ${label} uses the default`, () => {
      const cfg = normalizeConfig({ data_dir: blank, agents: [agent] });
      assert.equal(cfg.data_dir, DEFAULT_DATA_DIR);
    });

    it(`top-level webhook_key_header ${label} uses the default`, () => {
      const cfg = normalizeConfig({ webhook_key_header: blank, agents: [agent] });
      assert.equal(cfg.webhook_key_header, DEFAULT_WEBHOOK_KEY_HEADER);
      assert.equal(cfg.agents[0].webhook_key_header, DEFAULT_WEBHOOK_KEY_HEADER);
    });

    it(`agent webhook_key_header ${label} inherits the config value`, () => {
      const cfg = normalizeConfig({
        webhook_key_header: 'X-Agent-Key',
        agents: [{ ...agent, webhook_key_header: blank }],
      });
      assert.equal(cfg.agents[0].webhook_key_header, 'X-Agent-Key');
    });
  }
});

describe('config strictness and error format', () => {
  it('rejects a non-boolean enable_dms', () => {
    assert.throws(() => normalizeConfig({ enable_dms: 'yes', agents: [agent] }), /^Error: enable_dms: /);
    assert.throws(
      () => normalizeConfig({ agents: [{ ...agent, enable_dms: 'yes' }] }),
      /^Error: agents\[0\]\.enable_dms: /,
    );
  });

  it('prefixes errors with the field path', () => {
    assert.throws(
      () => normalizeConfig({ agents: [{ ...agent, name: 'bad name' }] }),
      (err) => err instanceof Error && err.message.startsWith('agents[0].name: Invalid agent name'),
    );
  });
});
