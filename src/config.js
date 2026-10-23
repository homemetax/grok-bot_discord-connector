'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_WEBHOOK_KEY_HEADER,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_WEBHOOK_TIMEOUT_MS,
  DEFAULT_LOOP_GUARD,
  DISCORD_HISTORY_MAX,
  DEFAULT_DATA_DIR,
  DEFAULT_PER_AUTHOR_DAILY_LIMIT,
  DEFAULT_MENTION_MODE,
  MENTION_MODES,
  MAX_PER_AUTHOR_DAILY_LIMIT,
} = require('./constants');
const {
  assertAgentName,
  assertEnvName,
  assertHeaderName,
  assertPositiveInt,
  isSnowflake,
} = require('./validate');

function readJsonFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(`Config file not found: ${filePath}`);
    }
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Config file is not valid JSON: ${filePath} (${err.message})`);
  }
}

function resolveConfigPath(env = process.env, cwd = process.cwd()) {
  if (env.CONFIG_PATH) return path.resolve(cwd, env.CONFIG_PATH);
  return path.resolve(cwd, 'config', 'agents.json');
}

function normalizeLoopGuard(raw = {}) {
  const merged = { ...DEFAULT_LOOP_GUARD, ...raw };
  return {
    max_bot_exchanges: assertPositiveInt(merged.max_bot_exchanges, 'loop_guard.max_bot_exchanges', {
      min: 1,
      max: 1000,
    }),
    window_ms: assertPositiveInt(merged.window_ms, 'loop_guard.window_ms', {
      min: 1,
      max: 24 * 60 * 60 * 1000,
    }),
    cooldown_ms: assertPositiveInt(merged.cooldown_ms, 'loop_guard.cooldown_ms', {
      min: 0,
      max: 24 * 60 * 60 * 1000,
    }),
  };
}

function normalizeAgent(raw, defaults, index) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`agents[${index}] must be an object`);
  }
  const name = assertAgentName(raw.name);
  const token_env = assertEnvName(raw.token_env, `${name}.token_env`);
  const webhook_url_env = assertEnvName(raw.webhook_url_env, `${name}.webhook_url_env`);
  const webhook_key_env = assertEnvName(raw.webhook_key_env, `${name}.webhook_key_env`);

  const allowed = raw.allowed_channel_ids;
  let allowed_channel_ids = [];
  if (allowed !== undefined && allowed !== null) {
    if (!Array.isArray(allowed)) {
      throw new Error(`${name}.allowed_channel_ids must be an array of channel snowflakes when set`);
    }
    for (const id of allowed) {
      if (!isSnowflake(id)) {
        throw new Error(`${name}.allowed_channel_ids contains an invalid snowflake: ${JSON.stringify(id)}`);
      }
      allowed_channel_ids.push(String(id));
    }
  }

  const history_limit = raw.history_limit === undefined
    ? defaults.history_limit
    : assertPositiveInt(raw.history_limit, `${name}.history_limit`, { min: 1, max: DISCORD_HISTORY_MAX });

  const enable_dms = raw.enable_dms === undefined ? defaults.enable_dms : Boolean(raw.enable_dms);

  const webhook_key_header = raw.webhook_key_header
    ? assertHeaderName(raw.webhook_key_header)
    : defaults.webhook_key_header;

  const webhook_timeout_ms = raw.webhook_timeout_ms === undefined
    ? defaults.webhook_timeout_ms
    : assertPositiveInt(raw.webhook_timeout_ms, `${name}.webhook_timeout_ms`, { min: 1000, max: 120000 });

  const loop_guard = raw.loop_guard
    ? normalizeLoopGuard({ ...defaults.loop_guard, ...raw.loop_guard })
    : defaults.loop_guard;

  const mention_mode = raw.mention_mode === undefined
    ? defaults.mention_mode
    : normalizeMentionMode(raw.mention_mode, `${name}.mention_mode`);

  const per_author_daily_limit = raw.per_author_daily_limit === undefined
    ? defaults.per_author_daily_limit
    : assertPositiveInt(raw.per_author_daily_limit, `${name}.per_author_daily_limit`, {
      min: 0,
      max: MAX_PER_AUTHOR_DAILY_LIMIT,
    });

  const rate_limit_exempt_author_ids = raw.rate_limit_exempt_author_ids === undefined
    ? defaults.rate_limit_exempt_author_ids.slice()
    : normalizeSnowflakeList(raw.rate_limit_exempt_author_ids, `${name}.rate_limit_exempt_author_ids`);

  return {
    name,
    token_env,
    webhook_url_env,
    webhook_key_env,
    allowed_channel_ids,
    history_limit,
    enable_dms,
    webhook_key_header,
    webhook_timeout_ms,
    loop_guard,
    mention_mode,
    per_author_daily_limit,
    rate_limit_exempt_author_ids,
  };
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Config root must be an object');
  }
  const webhook_key_header = assertHeaderName(raw.webhook_key_header || DEFAULT_WEBHOOK_KEY_HEADER);
  const history_limit = raw.history_limit === undefined
    ? DEFAULT_HISTORY_LIMIT
    : assertPositiveInt(raw.history_limit, 'history_limit', { min: 1, max: DISCORD_HISTORY_MAX });
  const enable_dms = Boolean(raw.enable_dms);
  const webhook_timeout_ms = raw.webhook_timeout_ms === undefined
    ? DEFAULT_WEBHOOK_TIMEOUT_MS
    : assertPositiveInt(raw.webhook_timeout_ms, 'webhook_timeout_ms', { min: 1000, max: 120000 });
  const loop_guard = normalizeLoopGuard(raw.loop_guard || {});
  const mention_mode = normalizeMentionMode(raw.mention_mode, 'mention_mode');
  const per_author_daily_limit = raw.per_author_daily_limit === undefined
    ? DEFAULT_PER_AUTHOR_DAILY_LIMIT
    : assertPositiveInt(raw.per_author_daily_limit, 'per_author_daily_limit', {
      min: 0,
      max: MAX_PER_AUTHOR_DAILY_LIMIT,
    });
  const rate_limit_exempt_author_ids = normalizeSnowflakeList(
    raw.rate_limit_exempt_author_ids,
    'rate_limit_exempt_author_ids',
  );
  const data_dir = normalizeDataDir(raw.data_dir);

  if (!Array.isArray(raw.agents) || raw.agents.length === 0) {
    throw new Error('Config must list at least one agent');
  }

  const defaults = {
    webhook_key_header,
    history_limit,
    enable_dms,
    webhook_timeout_ms,
    loop_guard,
    mention_mode,
    per_author_daily_limit,
    rate_limit_exempt_author_ids,
  };

  const agents = [];
  const seen = new Set();
  for (let i = 0; i < raw.agents.length; i += 1) {
    const agent = normalizeAgent(raw.agents[i], defaults, i);
    const key = agent.name.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate agent name: ${agent.name}`);
    }
    seen.add(key);
    agents.push(agent);
  }

  return {
    webhook_key_header,
    history_limit,
    enable_dms,
    webhook_timeout_ms,
    loop_guard,
    mention_mode,
    per_author_daily_limit,
    rate_limit_exempt_author_ids,
    data_dir,
    agents,
  };
}

function loadConfig({ env = process.env, cwd = process.cwd(), filePath } = {}) {
  const resolved = filePath ? path.resolve(cwd, filePath) : resolveConfigPath(env, cwd);
  const raw = readJsonFile(resolved);
  const config = normalizeConfig(raw);
  config.config_path = resolved;
  return config;
}

/**
 * Multi-client vs one-process-per-bot.
 * DISCORD_AGENT unset => all agents. Set => exactly that agent.
 */
function selectAgents(config, env = process.env) {
  const requested = env.DISCORD_AGENT;
  if (requested === undefined || requested === '') {
    return config.agents.slice();
  }
  const name = String(requested);
  const agent = config.agents.find((a) => a.name === name || a.name.toLowerCase() === name.toLowerCase());
  if (!agent) {
    const known = config.agents.map((a) => a.name).join(', ');
    throw new Error(`Unknown agent "${name}". Known agents: ${known}`);
  }
  return [agent];
}

function normalizeMentionMode(raw, label) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_MENTION_MODE;
  if (typeof raw !== 'string' || !MENTION_MODES.includes(raw)) {
    throw new Error(`Invalid ${label}: expected ${MENTION_MODES.join(' or ')}`);
  }
  return raw;
}

function normalizeSnowflakeList(raw, label) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`${label} must be an array of snowflakes`);
  }
  const out = [];
  for (const id of raw) {
    if (!isSnowflake(id)) {
      throw new Error(`${label} contains an invalid snowflake: ${JSON.stringify(id)}`);
    }
    out.push(String(id));
  }
  return out;
}

function normalizeDataDir(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_DATA_DIR;
  if (typeof raw !== 'string' || raw.includes('\0')) {
    throw new Error('Invalid data_dir');
  }
  return raw;
}

/**
 * DATA_DIR env wins, then config data_dir, then ./data. Resolved against cwd.
 */
function resolveDataDir({ config, env = process.env, cwd = process.cwd() } = {}) {
  const fromEnv = env && env.DATA_DIR;
  if (fromEnv !== undefined && String(fromEnv).trim() !== '') {
    return path.resolve(cwd, String(fromEnv));
  }
  const fromConfig = config && config.data_dir;
  return path.resolve(cwd, fromConfig || DEFAULT_DATA_DIR);
}

function findAgent(config, name) {
  if (!name) {
    throw new Error('Agent name is required (--agent or DISCORD_AGENT)');
  }
  const agent = config.agents.find(
    (a) => a.name === name || a.name.toLowerCase() === String(name).toLowerCase(),
  );
  if (!agent) {
    const known = config.agents.map((a) => a.name).join(', ');
    throw new Error(`Unknown agent "${name}". Known agents: ${known}`);
  }
  return agent;
}

module.exports = {
  loadConfig,
  normalizeConfig,
  selectAgents,
  findAgent,
  resolveConfigPath,
  resolveDataDir,
};
