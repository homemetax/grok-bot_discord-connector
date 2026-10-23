'use strict';

/** Discord message content limit (characters). */
const DISCORD_CONTENT_LIMIT = 2000;

/** Maximum messages Discord will return from GET /channels/{id}/messages. */
const DISCORD_HISTORY_MAX = 100;

/**
 * Invite permission integer requested in README.
 * Bitfield of: MANAGE_CHANNELS, ADD_REACTIONS, VIEW_CHANNEL, SEND_MESSAGES,
 * EMBED_LINKS, ATTACH_FILES, READ_MESSAGE_HISTORY, MANAGE_ROLES,
 * MANAGE_THREADS, CREATE_PUBLIC_THREADS, SEND_MESSAGES_IN_THREADS.
 *
 * Compute: sum of (1n << bit) for each permission flag. See README.
 */
const INVITE_PERMISSIONS = '326686067792';

const INVITE_PERMISSION_FLAGS = [
  'MANAGE_CHANNELS',
  'ADD_REACTIONS',
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'EMBED_LINKS',
  'ATTACH_FILES',
  'READ_MESSAGE_HISTORY',
  'MANAGE_ROLES',
  'MANAGE_THREADS',
  'CREATE_PUBLIC_THREADS',
  'SEND_MESSAGES_IN_THREADS',
];

const SNOWFLAKE_RE = /^\d{17,20}$/;
const AGENT_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEADER_NAME_RE = /^[A-Za-z0-9-]+$/;

const DEFAULT_WEBHOOK_KEY_HEADER = 'Authorization';
const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_WEBHOOK_TIMEOUT_MS = 30000;
const DEFAULT_LOOP_GUARD = Object.freeze({
  max_bot_exchanges: 6,
  window_ms: 120000,
  cooldown_ms: 8000,
});

const DEFAULT_ALLOWED_MENTIONS = Object.freeze({
  parse: Object.freeze(['users']),
});

/** Cap inbound webhook Retry-After waits so a huge retry_after cannot stall the process. */
const MAX_WEBHOOK_RETRY_AFTER_MS = 15000;

const THREAD_CHANNEL_TYPES = Object.freeze([
  10,
  11,
  12,
  'GUILD_NEWS_THREAD',
  'GUILD_PUBLIC_THREAD',
  'GUILD_PRIVATE_THREAD',
  'ANNOUNCEMENT_THREAD',
  'PUBLIC_THREAD',
  'PRIVATE_THREAD',
]);

module.exports = {
  DISCORD_CONTENT_LIMIT,
  DISCORD_HISTORY_MAX,
  INVITE_PERMISSIONS,
  INVITE_PERMISSION_FLAGS,
  SNOWFLAKE_RE,
  AGENT_NAME_RE,
  ENV_NAME_RE,
  HEADER_NAME_RE,
  DEFAULT_WEBHOOK_KEY_HEADER,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_WEBHOOK_TIMEOUT_MS,
  DEFAULT_LOOP_GUARD,
  DEFAULT_ALLOWED_MENTIONS,
  MAX_WEBHOOK_RETRY_AFTER_MS,
  THREAD_CHANNEL_TYPES,
};
