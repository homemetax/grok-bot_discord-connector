'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { normalizeConfig, selectAgents, resolveDataDir, loadConfig } = require('../src/config');

const sample = {
  history_limit: 20,
  agents: [
    {
      name: 'GrokBot',
      token_env: 'GROKBOT_DISCORD_TOKEN',
      webhook_url_env: 'GROKBOT_WEBHOOK_URL',
      webhook_key_env: 'GROKBOT_WEBHOOK_KEY',
      allowed_channel_ids: ['123456789012345678'],
    },
    {
      name: 'agent-1',
      token_env: 'AGENT_1_DISCORD_TOKEN',
      webhook_url_env: 'AGENT_1_WEBHOOK_URL',
      webhook_key_env: 'AGENT_1_WEBHOOK_KEY',
      allowed_channel_ids: ['123456789012345678'],
    },
  ],
};

describe('normalizeConfig', () => {
  it('accepts a valid multi-agent config', () => {
    const cfg = normalizeConfig(sample);
    assert.equal(cfg.agents.length, 2);
    assert.equal(cfg.agents[0].name, 'GrokBot');
    assert.equal(cfg.webhook_key_header, 'Authorization');
    assert.equal(cfg.loop_guard.max_bot_exchanges, 6);
  });

  it('rejects duplicate agent names', () => {
    assert.throws(() =>
      normalizeConfig({
        agents: [sample.agents[0], { ...sample.agents[1], name: 'GrokBot' }],
      }),
    );
  });

  it('rejects invalid channel ids', () => {
    assert.throws(() =>
      normalizeConfig({
        agents: [{ ...sample.agents[0], allowed_channel_ids: ['not-an-id'] }],
      }),
    );
  });

  it('rejects empty agents list', () => {
    assert.throws(() => normalizeConfig({ agents: [] }));
  });

  it('defaults webhook_key_header to Authorization', () => {
    const cfg = normalizeConfig({
      agents: [{
        name: 'GrokBot',
        token_env: 'GROKBOT_DISCORD_TOKEN',
        webhook_url_env: 'GROKBOT_WEBHOOK_URL',
        webhook_key_env: 'GROKBOT_WEBHOOK_KEY',
      }],
    });
    assert.equal(cfg.webhook_key_header, 'Authorization');
    assert.equal(cfg.agents[0].webhook_key_header, 'Authorization');
  });

  it('defaults mention_mode, daily limit, exempt list, and data_dir', () => {
    const cfg = normalizeConfig({
      agents: [{
        name: 'agent-1',
        token_env: 'AGENT_1_DISCORD_TOKEN',
        webhook_url_env: 'AGENT_1_WEBHOOK_URL',
        webhook_key_env: 'AGENT_1_WEBHOOK_KEY',
      }],
    });
    assert.equal(cfg.mention_mode, 'user_or_role');
    assert.equal(cfg.per_author_daily_limit, 0);
    assert.deepEqual(cfg.rate_limit_exempt_author_ids, []);
    assert.equal(cfg.data_dir, './data');
    assert.equal(cfg.agents[0].mention_mode, 'user_or_role');
    assert.equal(cfg.agents[0].per_author_daily_limit, 0);
    assert.deepEqual(cfg.agents[0].rate_limit_exempt_author_ids, []);
  });

  it('accepts GrokBot-style daily limit, exempt ids, and user_only mention_mode', () => {
    const cfg = normalizeConfig({
      agents: [{
        name: 'GrokBot',
        token_env: 'GROKBOT_DISCORD_TOKEN',
        webhook_url_env: 'GROKBOT_WEBHOOK_URL',
        webhook_key_env: 'GROKBOT_WEBHOOK_KEY',
        per_author_daily_limit: 1,
        rate_limit_exempt_author_ids: ['200000000000000001'],
        mention_mode: 'user_only',
      }],
    });
    assert.equal(cfg.agents[0].per_author_daily_limit, 1);
    assert.deepEqual(cfg.agents[0].rate_limit_exempt_author_ids, ['200000000000000001']);
    assert.equal(cfg.agents[0].mention_mode, 'user_only');
  });

  it('rejects an unknown mention_mode', () => {
    assert.throws(() =>
      normalizeConfig({
        agents: [{ ...sample.agents[0], mention_mode: 'everyone' }],
      }),
    );
  });

  it('rejects a negative per_author_daily_limit', () => {
    assert.throws(() =>
      normalizeConfig({
        agents: [{ ...sample.agents[0], per_author_daily_limit: -1 }],
      }),
    );
  });

  it('rejects invalid rate_limit_exempt_author_ids', () => {
    assert.throws(() =>
      normalizeConfig({
        agents: [{ ...sample.agents[0], rate_limit_exempt_author_ids: ['not-an-id'] }],
      }),
    );
  });

  it('accepts a missing or empty allowed_channel_ids list', () => {
    const { allowed_channel_ids: omitted } = normalizeConfig({
      agents: [{
        name: 'GrokBot',
        token_env: 'GROKBOT_DISCORD_TOKEN',
        webhook_url_env: 'GROKBOT_WEBHOOK_URL',
        webhook_key_env: 'GROKBOT_WEBHOOK_KEY',
      }],
    }).agents[0];
    assert.deepEqual(omitted, []);

    const { allowed_channel_ids: empty } = normalizeConfig({
      agents: [{
        name: 'agent-1',
        token_env: 'AGENT_1_DISCORD_TOKEN',
        webhook_url_env: 'AGENT_1_WEBHOOK_URL',
        webhook_key_env: 'AGENT_1_WEBHOOK_KEY',
        allowed_channel_ids: [],
      }],
    }).agents[0];
    assert.deepEqual(empty, []);
  });
});

describe('resolveDataDir', () => {
  it('defaults to ./data under cwd', () => {
    assert.equal(resolveDataDir({ cwd: '/opt/app', env: {} }), path.resolve('/opt/app', './data'));
  });

  it('prefers DATA_DIR over config data_dir', () => {
    assert.equal(
      resolveDataDir({
        config: { data_dir: './from-config' },
        env: { DATA_DIR: '/var/lib/connector' },
        cwd: '/opt/app',
      }),
      path.resolve('/opt/app', '/var/lib/connector'),
    );
  });
});

describe('example config', () => {
  it('loads agents.example.json with GrokBot user_only and daily limit 1', () => {
    const cfg = loadConfig({
      filePath: 'config/agents.example.json',
      cwd: path.join(__dirname, '..'),
    });
    const grokbot = cfg.agents.find((a) => a.name === 'GrokBot');
    assert.equal(grokbot.per_author_daily_limit, 1);
    assert.deepEqual(grokbot.rate_limit_exempt_author_ids, ['200000000000000001']);
    assert.equal(grokbot.mention_mode, 'user_only');
    assert.equal(cfg.agents.find((a) => a.name === 'agent-1').per_author_daily_limit, 0);
    assert.equal(cfg.agents.find((a) => a.name === 'agent-1').mention_mode, 'user_or_role');
  });
});

describe('selectAgents (multi-client vs one process per bot)', () => {
  const cfg = normalizeConfig(sample);

  it('returns every agent when DISCORD_AGENT is unset', () => {
    const selected = selectAgents(cfg, {});
    assert.deepEqual(selected.map((a) => a.name), ['GrokBot', 'agent-1']);
  });

  it('returns one agent when DISCORD_AGENT is set', () => {
    const selected = selectAgents(cfg, { DISCORD_AGENT: 'agent-1' });
    assert.deepEqual(selected.map((a) => a.name), ['agent-1']);
  });

  it('throws on an unknown DISCORD_AGENT', () => {
    assert.throws(() => selectAgents(cfg, { DISCORD_AGENT: 'agent-9' }));
  });
});
