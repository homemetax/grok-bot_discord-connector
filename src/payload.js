'use strict';

const { parsePayload } = require('./validate');

/**
 * Build the Grok Bot routine webhook JSON.
 *
 * Discord content is copied as opaque strings. Callers must never eval,
 * spawn, or otherwise execute these fields.
 */

/** @param {any} [opts] */
function buildPayload(opts) {
  return parsePayload(opts);
}

function authorNameFromDiscord(message) {
  const memberName = message.member && message.member.displayName;
  const user = message.author || {};
  return memberName || user.globalName || user.username || '';
}

function attachmentsFromDiscord(message) {
  const col = message.attachments;
  if (!col) return [];
  const values = typeof col.values === 'function' ? [...col.values()] : Array.isArray(col) ? col : [];
  return values.map((a) => ({
    url: a.url,
    name: a.name,
    type: a.contentType || a.content_type || a.type || '',
    size: a.size,
  }));
}

function historyFromDiscordMessages(messages) {
  return (messages || []).map((m) => ({
    id: m.id,
    author: {
      id: m.author && m.author.id,
      name: authorNameFromDiscord(m),
      is_bot: Boolean(m.author && m.author.bot),
    },
    content: m.content == null ? '' : String(m.content),
    attachments: attachmentsFromDiscord(m),
  }));
}

module.exports = {
  buildPayload,
  authorNameFromDiscord,
  attachmentsFromDiscord,
  historyFromDiscordMessages,
};
