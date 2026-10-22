'use strict';

/**
 * Map discord.js / REST errors into operator-facing messages.
 * Surface 403s clearly (permissions / role hierarchy). Do not retry 401.
 */

class ConnectorError extends Error {
  constructor(message, { status = 0, code = null, retryAfter = null, cause = null } = {}) {
    super(message);
    this.name = 'ConnectorError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    if (cause) this.cause = cause;
  }
}

function extractRetryAfter(err) {
  if (!err) return null;
  if (typeof err.retryAfter === 'number') return err.retryAfter;
  if (typeof err.retryAfterMs === 'number') return err.retryAfterMs / 1000;
  const raw = err.rawError || err.body;
  if (raw && typeof raw.retry_after === 'number') return raw.retry_after;
  const headers = err.headers || (err.cause && err.cause.headers);
  if (headers) {
    const value = headers['retry-after'] || headers['x-ratelimit-reset-after'];
    if (value != null) {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function wrapDiscordError(err) {
  if (err instanceof ConnectorError) return err;
  const status = err && (err.status || err.statusCode || err.httpStatus) || 0;
  const code = err && (err.code || (err.rawError && err.rawError.code));
  const retryAfter = extractRetryAfter(err);
  const apiMessage = err && (err.rawError && err.rawError.message) || (err && err.message) || 'Discord request failed';

  let message;
  if (status === 401) {
    message = [
      'Unauthorized (401): the bot token is missing or invalid.',
      'Check the agent token env var. Further Discord calls for this agent are refused to avoid a 401 storm.',
    ].join(' ');
  } else if (status === 403) {
    message = [
      'Forbidden (403): Discord denied this action.',
      'The bot lacks the channel permission, or its highest role is at or below the target role (role hierarchy).',
      'ManageRoles/ManageChannels are powerful; a 403 here is Discord enforcing hierarchy or overwrites, not a connector cap.',
      `Discord said: ${apiMessage}`,
    ].join(' ');
  } else if (status === 404) {
    message = `Not found (404): unknown channel, message, guild, or user. Discord said: ${apiMessage}`;
  } else if (status === 429) {
    const wait = retryAfter != null ? ` retry_after=${retryAfter}s` : '';
    message = `Rate limited (429).${wait} Respect Retry-After / X-RateLimit headers before retrying.`;
  } else {
    message = `Discord error${status ? ` (${status})` : ''}${code ? ` code=${code}` : ''}: ${apiMessage}`;
  }

  return new ConnectorError(message, { status, code, retryAfter, cause: err });
}

function exitCodeForError(err) {
  const status = err && err.status;
  if (status === 401) return 2;
  if (status === 403) return 3;
  if (status === 429) return 4;
  return 1;
}

module.exports = { ConnectorError, wrapDiscordError, extractRetryAfter, exitCodeForError };
