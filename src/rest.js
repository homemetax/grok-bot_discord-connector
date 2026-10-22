'use strict';

const { REST, Routes } = require('discord.js');
const { ConnectorError, wrapDiscordError } = require('./discord-error');
const { requireEnv } = require('./env');
const { assertSnowflake } = require('./validate');

/**
 * Per-token REST session. discord.js honors X-RateLimit / retry_after.
 * After a 401, further calls are refused so a bad token cannot storm Discord.
 */
class RestSession {
  constructor(token) {
    if (typeof token !== 'string' || token.length < 8) {
      throw new Error('Discord token is missing or too short');
    }
    this.rest = new REST({ version: '10' }).setToken(token);
    this.invalidToken = false;
  }

  async call(method, route, options) {
    if (this.invalidToken) {
      throw new ConnectorError(
        'Refusing Discord request: a previous call returned 401 (invalid token) for this agent.',
        { status: 401 },
      );
    }
    try {
      const fn = this.rest[method];
      if (typeof fn !== 'function') {
        throw new Error(`Unknown REST method ${method}`);
      }
      return await fn.call(this.rest, route, options);
    } catch (err) {
      const wrapped = wrapDiscordError(err);
      if (wrapped.status === 401) this.invalidToken = true;
      throw wrapped;
    }
  }
}

const sessions = new Map();

function restForAgent(agent, env = process.env) {
  const token = requireEnv(agent.token_env, env);
  let session = sessions.get(agent.token_env);
  if (!session) {
    session = new RestSession(token);
    sessions.set(agent.token_env, session);
  }
  return session;
}

function resetSessions() {
  sessions.clear();
}

/** Identifier for Routes.channelMessageOwnReaction (library encodes the path). */
function encodeEmoji(emoji) {
  if (typeof emoji !== 'string' || !emoji.length) {
    throw new Error('Emoji is required');
  }
  const value = emoji.trim();
  if (value.length > 64 || /[\r\n\/?#]/.test(value)) {
    throw new Error('Invalid emoji');
  }
  const wrapped = value.match(/^<a?:([^:>]+):(\d{17,20})>$/);
  if (wrapped) return `${wrapped[1]}:${wrapped[2]}`;
  if (/^[a-zA-Z0-9_]+:\d{17,20}$/.test(value)) return value;
  return value;
}

function query(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  return usp;
}

function channelRoute(channelId) {
  return Routes.channel(assertSnowflake(channelId, 'channel id'));
}

function messagesRoute(channelId) {
  return Routes.channelMessages(assertSnowflake(channelId, 'channel id'));
}

function messageRoute(channelId, messageId) {
  return Routes.channelMessage(
    assertSnowflake(channelId, 'channel id'),
    assertSnowflake(messageId, 'message id'),
  );
}

module.exports = {
  RestSession,
  restForAgent,
  resetSessions,
  encodeEmoji,
  query,
  channelRoute,
  messagesRoute,
  messageRoute,
  Routes,
};
