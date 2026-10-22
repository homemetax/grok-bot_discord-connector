'use strict';

/**
 * Build the Grok Bot routine webhook JSON.
 *
 * Discord content is copied as opaque strings. Callers must never eval,
 * spawn, or otherwise execute these fields.
 */

function mapAuthor(author = {}) {
  return {
    id: author.id == null ? '' : String(author.id),
    name: author.name == null ? '' : String(author.name),
    is_bot: Boolean(author.is_bot),
  };
}

function mapAttachment(att = {}) {
  return {
    url: att.url == null ? '' : String(att.url),
    name: att.name == null ? '' : String(att.name),
    type: att.type == null ? '' : String(att.type),
    size: Number.isFinite(att.size) ? att.size : 0,
  };
}

function mapHistoryItem(item = {}) {
  return {
    id: item.id == null ? '' : String(item.id),
    author: mapAuthor(item.author),
    content: item.content == null ? '' : String(item.content),
    attachments: Array.isArray(item.attachments) ? item.attachments.map(mapAttachment) : [],
  };
}

function buildPayload({
  agent,
  guild_id = null,
  channel_id,
  thread_id = null,
  msg_id,
  author,
  content,
  history = [],
  attachments = [],
} = {}) {
  return {
    agent: agent == null ? '' : String(agent),
    guild_id: guild_id == null ? null : String(guild_id),
    channel_id: channel_id == null ? '' : String(channel_id),
    thread_id: thread_id == null ? null : String(thread_id),
    msg_id: msg_id == null ? '' : String(msg_id),
    author: mapAuthor(author),
    content: content == null ? '' : String(content),
    history: Array.isArray(history) ? history.map(mapHistoryItem) : [],
    attachments: Array.isArray(attachments) ? attachments.map(mapAttachment) : [],
  };
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
