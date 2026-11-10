'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { z } = require('zod');
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
  AGENT_NAME_RE,
  ENV_NAME_RE,
  HEADER_NAME_RE,
  SNOWFLAKE_RE,
} = require('./constants');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {object} LoopGuardConfig
 * @property {number} max_bot_exchanges
 * @property {number} window_ms
 * @property {number} cooldown_ms
 *
 * @typedef {object} AgentConfig
 * @property {string} name
 * @property {string} token_env
 * @property {string} webhook_url_env
 * @property {string} webhook_key_env
 * @property {string[]} allowed_channel_ids
 * @property {number} history_limit
 * @property {boolean} enable_dms
 * @property {string} webhook_key_header
 * @property {number} webhook_timeout_ms
 * @property {LoopGuardConfig} loop_guard
 * @property {string} mention_mode
 * @property {number} per_author_daily_limit
 * @property {string[]} rate_limit_exempt_author_ids
 *
 * @typedef {object} ConnectorConfig
 * @property {string} webhook_key_header
 * @property {number} history_limit
 * @property {boolean} enable_dms
 * @property {number} webhook_timeout_ms
 * @property {LoopGuardConfig} loop_guard
 * @property {string} mention_mode
 * @property {number} per_author_daily_limit
 * @property {string[]} rate_limit_exempt_author_ids
 * @property {string} data_dir
 * @property {AgentConfig[]} agents
 * @property {string} [config_path]
 *
 * @typedef {object} LoadConfigOpts
 * @property {NodeJS.ProcessEnv} [env]
 * @property {string} [cwd]
 * @property {string} [filePath]
 *
 * @typedef {object} ResolveDataDirOpts
 * @property {{ data_dir?: string }} [config]
 * @property {NodeJS.ProcessEnv} [env]
 * @property {string} [cwd]
 */

const snowflake = z.coerce.string().regex(SNOWFLAKE_RE, {
  error: 'expected a Discord snowflake (17-20 digit id)',
});
const envName = z.string().regex(ENV_NAME_RE, { error: 'invalid environment variable name' });
const headerName = z.string().regex(HEADER_NAME_RE, { error: 'Invalid webhook key header name' });
const mentionMode = z.enum(MENTION_MODES);
const snowflakeList = z.array(snowflake);
const historyLimit = z.number().int().min(1).max(DISCORD_HISTORY_MAX);
const webhookTimeoutMs = z.number().int().min(1000).max(120000);
const perAuthorDailyLimit = z.number().int().min(0).max(MAX_PER_AUTHOR_DAILY_LIMIT);

/** null and "" count as omitted (same as dev before zod). */
const blankAs = (fallback, schema) =>
  z.preprocess((value) => (value === null || value === '' ? fallback : value), schema);

const LoopGuardSchema = z.object({
  max_bot_exchanges: z.number().int().min(1).max(1000).optional(),
  window_ms: z.number().int().min(1).max(DAY_MS).optional(),
  cooldown_ms: z.number().int().min(0).max(DAY_MS).optional(),
});

const AgentSchema = z.object({
  name: z.string().regex(AGENT_NAME_RE, {
    error: 'Invalid agent name: use 1-64 letters, digits, underscore, or hyphen',
  }),
  token_env: envName,
  webhook_url_env: envName,
  webhook_key_env: envName,
  allowed_channel_ids: snowflakeList.nullish(),
  history_limit: historyLimit.optional(),
  enable_dms: z.boolean().optional(),
  webhook_key_header: blankAs(undefined, headerName.optional()),
  webhook_timeout_ms: webhookTimeoutMs.optional(),
  loop_guard: LoopGuardSchema.optional(),
  // dev parity: a blank agent mention_mode means the built-in default, not the config-level value.
  mention_mode: blankAs(DEFAULT_MENTION_MODE, mentionMode.optional()),
  per_author_daily_limit: perAuthorDailyLimit.optional(),
  rate_limit_exempt_author_ids: snowflakeList.optional(),
});

const ConfigSchema = z.object({
  webhook_key_header: blankAs(undefined, headerName.default(DEFAULT_WEBHOOK_KEY_HEADER)),
  history_limit: historyLimit.default(DEFAULT_HISTORY_LIMIT),
  enable_dms: z.boolean().default(false),
  webhook_timeout_ms: webhookTimeoutMs.default(DEFAULT_WEBHOOK_TIMEOUT_MS),
  loop_guard: LoopGuardSchema.default({}),
  mention_mode: blankAs(undefined, mentionMode.default(DEFAULT_MENTION_MODE)),
  per_author_daily_limit: perAuthorDailyLimit.default(DEFAULT_PER_AUTHOR_DAILY_LIMIT),
  rate_limit_exempt_author_ids: snowflakeList.nullish().default([]),
  data_dir: blankAs(
    undefined,
    z
      .string()
      .refine((value) => !value.includes('\0'), { error: 'Invalid data_dir' })
      .default(DEFAULT_DATA_DIR),
  ),
  agents: z.array(AgentSchema).min(1, { error: 'Config must list at least one agent' }),
}).superRefine((cfg, ctx) => {
  const seen = new Set();
  for (let i = 0; i < cfg.agents.length; i += 1) {
    const key = cfg.agents[i].name.toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['agents', i, 'name'],
        message: `Duplicate agent name: ${cfg.agents[i].name}`,
      });
      return;
    }
    seen.add(key);
  }
});

function formatPath(parts) {
  return parts
    .map((part, i) => {
      if (typeof part === 'number') return `[${part}]`;
      return i === 0 ? String(part) : `.${part}`;
    })
    .join('');
}

function formatConfigIssue(error) {
  const issue = error.issues[0];
  if (!issue) return 'Invalid config';
  const pathLabel = formatPath(issue.path);
  return pathLabel ? `${pathLabel}: ${issue.message}` : issue.message;
}

function completeLoopGuard(partial) {
  return { ...DEFAULT_LOOP_GUARD, ...partial };
}

/**
 * Fill omitted agent fields from config-level defaults (same inheritance as before).
 * @param {any} parsed
 * @returns {ConnectorConfig}
 */
function applyAgentDefaults(parsed) {
  const loop_guard = completeLoopGuard(parsed.loop_guard);
  const rate_limit_exempt_author_ids = (parsed.rate_limit_exempt_author_ids || []).slice();
  return {
    webhook_key_header: parsed.webhook_key_header,
    history_limit: parsed.history_limit,
    enable_dms: parsed.enable_dms,
    webhook_timeout_ms: parsed.webhook_timeout_ms,
    loop_guard,
    mention_mode: parsed.mention_mode,
    per_author_daily_limit: parsed.per_author_daily_limit,
    rate_limit_exempt_author_ids,
    data_dir: parsed.data_dir || DEFAULT_DATA_DIR,
    agents: parsed.agents.map((agent) => ({
      name: agent.name,
      token_env: agent.token_env,
      webhook_url_env: agent.webhook_url_env,
      webhook_key_env: agent.webhook_key_env,
      allowed_channel_ids: agent.allowed_channel_ids ? agent.allowed_channel_ids.slice() : [],
      history_limit: agent.history_limit === undefined ? parsed.history_limit : agent.history_limit,
      enable_dms: agent.enable_dms === undefined ? parsed.enable_dms : agent.enable_dms,
      webhook_key_header: agent.webhook_key_header || parsed.webhook_key_header,
      webhook_timeout_ms:
        agent.webhook_timeout_ms === undefined ? parsed.webhook_timeout_ms : agent.webhook_timeout_ms,
      loop_guard: completeLoopGuard({ ...loop_guard, ...agent.loop_guard }),
      mention_mode: agent.mention_mode === undefined ? parsed.mention_mode : agent.mention_mode,
      per_author_daily_limit:
        agent.per_author_daily_limit === undefined
          ? parsed.per_author_daily_limit
          : agent.per_author_daily_limit,
      rate_limit_exempt_author_ids:
        agent.rate_limit_exempt_author_ids === undefined
          ? rate_limit_exempt_author_ids.slice()
          : agent.rate_limit_exempt_author_ids.slice(),
    })),
  };
}

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

/**
 * @param {unknown} raw
 * @returns {ConnectorConfig}
 */
function normalizeConfig(raw) {
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatConfigIssue(result.error));
  }
  return applyAgentDefaults(result.data);
}

/**
 * @param {LoadConfigOpts} [opts]
 * @returns {ConnectorConfig}
 */
function loadConfig({ env = process.env, cwd = process.cwd(), filePath } = {}) {
  const resolved = filePath ? path.resolve(cwd, filePath) : resolveConfigPath(env, cwd);
  const config = normalizeConfig(readJsonFile(resolved));
  config.config_path = resolved;
  return config;
}

/**
 * Multi-client vs one-process-per-bot.
 * DISCORD_AGENT unset => all agents. Set => exactly that agent.
 * @param {ConnectorConfig} config
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {AgentConfig[]}
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

/**
 * DATA_DIR env wins, then config data_dir, then ./data. Resolved against cwd.
 * @param {ResolveDataDirOpts} [opts]
 */
function resolveDataDir({ config, env = process.env, cwd = process.cwd() } = {}) {
  const fromEnv = env && env.DATA_DIR;
  if (fromEnv !== undefined && String(fromEnv).trim() !== '') {
    return path.resolve(cwd, String(fromEnv));
  }
  const fromConfig = config && config.data_dir;
  return path.resolve(cwd, fromConfig || DEFAULT_DATA_DIR);
}

/**
 * @param {ConnectorConfig} config
 * @param {string} [name]
 * @returns {AgentConfig}
 */
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
  ConfigSchema,
  AgentSchema,
};
