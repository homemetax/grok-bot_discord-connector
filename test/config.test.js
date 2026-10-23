'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig, selectAgents } = require('../src/config');

const sample = {
  webhook_key_header: 'X-Webhook-Key',
  history_limit: 20,
  agents: [
    {
      name: 'miya',
      token_env: 'MIYA_DISCORD_TOKEN',
      webhook_url_env: 'MIYA_WEBHOOK_URL',
      webhook_key_env: 'MIYA_WEBHOOK_KEY',
      allowed_channel_ids: ['123456789012345678'],
    },
    {
      name: 'scar',
      token_env: 'SCAR_DISCORD_TOKEN',
      webhook_url_env: 'SCAR_WEBHOOK_URL',
      webhook_key_env: 'SCAR_WEBHOOK_KEY',
      allowed_channel_ids: ['123456789012345678'],
    },
  ],
};

describe('normalizeConfig', () => {
  it('accepts a valid multi-agent config', () => {
    const cfg = normalizeConfig(sample);
    assert.equal(cfg.agents.length, 2);
    assert.equal(cfg.agents[0].name, 'miya');
    assert.equal(cfg.webhook_key_header, 'X-Webhook-Key');
    assert.equal(cfg.loop_guard.max_bot_exchanges, 6);
  });

  it('rejects duplicate agent names', () => {
    assert.throws(() =>
      normalizeConfig({
        agents: [sample.agents[0], { ...sample.agents[1], name: 'miya' }],
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

  it('accepts a missing or empty allowed_channel_ids list', () => {
    const { allowed_channel_ids: omitted } = normalizeConfig({
      agents: [{
        name: 'miya',
        token_env: 'MIYA_DISCORD_TOKEN',
        webhook_url_env: 'MIYA_WEBHOOK_URL',
        webhook_key_env: 'MIYA_WEBHOOK_KEY',
      }],
    }).agents[0];
    assert.deepEqual(omitted, []);

    const { allowed_channel_ids: empty } = normalizeConfig({
      agents: [{
        name: 'scar',
        token_env: 'SCAR_DISCORD_TOKEN',
        webhook_url_env: 'SCAR_WEBHOOK_URL',
        webhook_key_env: 'SCAR_WEBHOOK_KEY',
        allowed_channel_ids: [],
      }],
    }).agents[0];
    assert.deepEqual(empty, []);
  });
});

describe('selectAgents (multi-client vs one process per bot)', () => {
  const cfg = normalizeConfig(sample);

  it('returns every agent when DISCORD_AGENT is unset', () => {
    const selected = selectAgents(cfg, {});
    assert.deepEqual(selected.map((a) => a.name), ['miya', 'scar']);
  });

  it('returns one agent when DISCORD_AGENT is set', () => {
    const selected = selectAgents(cfg, { DISCORD_AGENT: 'scar' });
    assert.deepEqual(selected.map((a) => a.name), ['scar']);
  });

  it('throws on an unknown DISCORD_AGENT', () => {
    assert.throws(() => selectAgents(cfg, { DISCORD_AGENT: 'pip' }));
  });
});
