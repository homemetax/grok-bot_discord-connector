'use strict';

const { z } = require('zod');
const {
  SNOWFLAKE_RE,
  AGENT_NAME_RE,
  ENV_NAME_RE,
  HEADER_NAME_RE,
  DEFAULT_DATA_DIR,
  DEFAULT_MENTION_MODE,
  MENTION_MODES,
} = require('./constants');

const omitted = z.union([z.undefined(), z.null()]);
const omittedOrEmpty = z.union([z.undefined(), z.null(), z.literal('')]);

const snowflakeValueSchema = z.any().refine(
  (id) => id != null && SNOWFLAKE_RE.test(String(id)),
);

const envFileKeySchema = z.string().regex(ENV_NAME_RE);

const authorSchema = z.any().transform((author) => {
  const a = author === undefined ? {} : author;
  return {
    id: a.id == null ? '' : String(a.id),
    name: a.name == null ? '' : String(a.name),
    is_bot: Boolean(a.is_bot),
  };
});

const attachmentSchema = z.any().transform((att) => {
  const a = att === undefined ? {} : att;
  return {
    url: a.url == null ? '' : String(a.url),
    name: a.name == null ? '' : String(a.name),
    type: a.type == null ? '' : String(a.type),
    size: Number.isFinite(a.size) ? a.size : 0,
  };
});

const historyItemSchema = z.any().transform((item) => {
  const row = item === undefined ? {} : item;
  return {
    id: row.id == null ? '' : String(row.id),
    author: authorSchema.parse(row.author),
    content: row.content == null ? '' : String(row.content),
    attachments: Array.isArray(row.attachments)
      ? row.attachments.map((att) => attachmentSchema.parse(att))
      : [],
  };
});

const payloadSchema = z.any().transform((input) => {
  const opts = input === undefined ? {} : input;
  const history = opts.history === undefined ? [] : opts.history;
  const attachments = opts.attachments === undefined ? [] : opts.attachments;
  return {
    agent: opts.agent == null ? '' : String(opts.agent),
    guild_id: opts.guild_id == null ? null : String(opts.guild_id),
    channel_id: opts.channel_id == null ? '' : String(opts.channel_id),
    thread_id: opts.thread_id == null ? null : String(opts.thread_id),
    msg_id: opts.msg_id == null ? '' : String(opts.msg_id),
    author: authorSchema.parse(opts.author),
    content: opts.content == null ? '' : String(opts.content),
    history: Array.isArray(history)
      ? history.map((item) => historyItemSchema.parse(item))
      : [],
    attachments: Array.isArray(attachments)
      ? attachments.map((att) => attachmentSchema.parse(att))
      : [],
  };
});

/** @param {any} schema @param {any} value */
function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new Error(issue && issue.message ? issue.message : 'Invalid value');
}

function snowflakeSchema(label = 'id') {
  return z.any()
    .refine(
      (id) => id != null && SNOWFLAKE_RE.test(String(id)),
      { error: `Invalid ${label}: expected a Discord snowflake (17-20 digit id)` },
    )
    .transform((id) => String(id));
}

function agentNameSchema() {
  return z.any().refine(
    (name) => typeof name === 'string' && AGENT_NAME_RE.test(name),
    { error: 'Invalid agent name: use 1-64 letters, digits, underscore, or hyphen' },
  );
}

function envNameSchema(label = 'env var') {
  return z.any().superRefine((name, ctx) => {
    if (typeof name !== 'string' || !ENV_NAME_RE.test(name)) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid ${label} name ${JSON.stringify(name)}`,
      });
    }
  });
}

function headerNameSchema() {
  return z.any().refine(
    (name) => typeof name === 'string' && HEADER_NAME_RE.test(name) && !/[\r\n]/.test(name),
    { error: 'Invalid webhook key header name' },
  );
}

function headerValueSchema(label = 'header value') {
  return z.any().superRefine((value, ctx) => {
    if (typeof value !== 'string' || value.length === 0) {
      ctx.addIssue({ code: 'custom', message: `${label} is empty` });
      return;
    }
    if (/[\r\n]/.test(value)) {
      ctx.addIssue({ code: 'custom', message: `${label} contains CR/LF` });
    }
  });
}

function positiveIntSchema(label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  return z.any().refine(
    (value) => Number.isInteger(value) && value >= min && value <= max,
    { error: `Invalid ${label}: expected integer between ${min} and ${max}` },
  );
}

function httpUrlSchema(label = 'url') {
  return z.any().transform((raw, ctx) => {
    let url;
    try {
      url = new URL(String(raw));
    } catch {
      ctx.addIssue({ code: 'custom', message: `Invalid ${label}: not a URL` });
      return z.NEVER;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      ctx.addIssue({ code: 'custom', message: `Invalid ${label}: only http(s) is allowed` });
      return z.NEVER;
    }
    return url.toString();
  });
}

function nonEmptyStringSchema(label) {
  return z.any().refine(
    (value) => typeof value === 'string' && value.length > 0,
    { error: `${label} must be a non-empty string` },
  );
}

function snowflakeArraySchema(label, arrayMessage) {
  return z.any()
    .superRefine((raw, ctx) => {
      if (!Array.isArray(raw)) {
        ctx.addIssue({
          code: 'custom',
          message: arrayMessage || `${label} must be an array of snowflakes`,
        });
        return;
      }
      for (const id of raw) {
        if (!isSnowflake(id)) {
          ctx.addIssue({
            code: 'custom',
            message: `${label} contains an invalid snowflake: ${JSON.stringify(id)}`,
          });
          return;
        }
      }
    })
    .transform((raw) => raw.map((id) => String(id)));
}

function mentionModeSchema(label) {
  return z.any().transform((raw, ctx) => {
    if (omittedOrEmpty.safeParse(raw).success) return DEFAULT_MENTION_MODE;
    if (typeof raw !== 'string' || !MENTION_MODES.includes(raw)) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid ${label}: expected ${MENTION_MODES.join(' or ')}`,
      });
      return z.NEVER;
    }
    return raw;
  });
}

function dataDirSchema() {
  return z.any().transform((raw, ctx) => {
    if (omittedOrEmpty.safeParse(raw).success) return DEFAULT_DATA_DIR;
    if (typeof raw !== 'string' || raw.includes('\0')) {
      ctx.addIssue({ code: 'custom', message: 'Invalid data_dir' });
      return z.NEVER;
    }
    return raw;
  });
}

function isSnowflake(id) {
  return snowflakeValueSchema.safeParse(id).success;
}

function isEnvName(name) {
  return envFileKeySchema.safeParse(name).success;
}

function assertSnowflake(id, label = 'id') {
  return parseOrThrow(snowflakeSchema(label), id);
}

function assertAgentName(name) {
  return parseOrThrow(agentNameSchema(), name);
}

function assertEnvName(name, label = 'env var') {
  return parseOrThrow(envNameSchema(label), name);
}

function assertHeaderName(name) {
  return parseOrThrow(headerNameSchema(), name);
}

function assertHeaderValue(value, label = 'header value') {
  return parseOrThrow(headerValueSchema(label), value);
}

function assertPositiveInt(value, label, bounds = {}) {
  return parseOrThrow(positiveIntSchema(label, bounds), value);
}

function parseLimit(value, fallback, { min = 1, max = 100 } = {}) {
  if (omittedOrEmpty.safeParse(value).success) return fallback;
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return assertPositiveInt(n, 'limit', { min, max });
}

function assertHttpUrl(raw, label = 'url') {
  return parseOrThrow(httpUrlSchema(label), raw);
}

function assertNonEmptyString(value, label) {
  return parseOrThrow(nonEmptyStringSchema(label), value);
}

function assertConfigRoot(raw) {
  return parseOrThrow(
    z.any().refine(
      (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
      { error: 'Config root must be an object' },
    ),
    raw,
  );
}

function assertAgentObject(raw, index) {
  return parseOrThrow(
    z.any().refine(
      (value) => Boolean(value) && typeof value === 'object',
      { error: `agents[${index}] must be an object` },
    ),
    raw,
  );
}

function assertNonEmptyAgents(agents) {
  return parseOrThrow(
    z.any().refine(
      (value) => Array.isArray(value) && value.length > 0,
      { error: 'Config must list at least one agent' },
    ),
    agents,
  );
}

function assertRequiredEnvName(name) {
  return parseOrThrow(
    z.any().refine(
      (value) => typeof value === 'string' && value.length > 0,
      { error: 'Environment variable name is required' },
    ),
    name,
  );
}

function assertRequiredEnvValue(value, name) {
  return parseOrThrow(
    z.any().refine(
      (v) => v !== undefined && v !== '',
      { error: `Missing required environment variable ${name}` },
    ),
    value,
  );
}

function normalizeMentionMode(raw, label) {
  return parseOrThrow(mentionModeSchema(label), raw);
}

function normalizeSnowflakeList(raw, label) {
  if (omitted.safeParse(raw).success) return [];
  return parseOrThrow(
    snowflakeArraySchema(label, `${label} must be an array of snowflakes`),
    raw,
  );
}

function normalizeAllowedChannelIds(raw, name) {
  if (omitted.safeParse(raw).success) return [];
  return parseOrThrow(
    snowflakeArraySchema(
      `${name}.allowed_channel_ids`,
      `${name}.allowed_channel_ids must be an array of channel snowflakes when set`,
    ),
    raw,
  );
}

function normalizeDataDir(raw) {
  return parseOrThrow(dataDirSchema(), raw);
}

function parsePayload(input) {
  return parseOrThrow(payloadSchema, input);
}

module.exports = {
  isSnowflake,
  isEnvName,
  assertSnowflake,
  assertAgentName,
  assertEnvName,
  assertHeaderName,
  assertHeaderValue,
  assertPositiveInt,
  parseLimit,
  assertHttpUrl,
  assertNonEmptyString,
  assertConfigRoot,
  assertAgentObject,
  assertNonEmptyAgents,
  assertRequiredEnvName,
  assertRequiredEnvValue,
  normalizeMentionMode,
  normalizeSnowflakeList,
  normalizeAllowedChannelIds,
  normalizeDataDir,
  parsePayload,
};
