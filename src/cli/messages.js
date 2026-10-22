'use strict';

const { splitMessage } = require('../split');
const { DISCORD_HISTORY_MAX } = require('../constants');
const { assertSnowflake, parseLimit } = require('../validate');
const { buildAllowedMentions } = require('../mentions-policy');
const { encodeEmoji, messagesRoute, messageRoute, query, Routes } = require('../rest');
const { loadFiles } = require('./files');
const { flagString, flagBool } = require('./parse');

function contentFromFlags(flags) {
  if (flags.content !== undefined && flags.content !== true) return String(flags.content);
  return undefined;
}

function requireContentOrFiles(content, files, { allowEmpty = false } = {}) {
  if ((content && content.length) || files.length || allowEmpty) return;
  throw new Error('Provide --content and/or --file');
}

async function sendChunks(session, channelId, { content, files, flags, reference }) {
  const allowed_mentions = buildAllowedMentions(flags);
  const chunks = splitMessage(content || '');
  const created = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const body = {
      content: chunks[i],
      allowed_mentions,
    };
    if (i === 0 && reference) {
      body.message_reference = {
        message_id: reference.messageId,
        fail_if_not_exists: false,
      };
      if (reference.channelId) body.message_reference.channel_id = reference.channelId;
      if (reference.guildId) body.message_reference.guild_id = reference.guildId;
    }
    const options = { body };
    if (i === 0 && files.length) options.files = files;
    const msg = await session.call('post', messagesRoute(channelId), options);
    created.push(msg);
  }

  return created;
}

async function cmdSend(session, flags) {
  const channelId = assertSnowflake(flagString(flags, 'channel', 'channel-id'), 'channel id');
  const content = contentFromFlags(flags) || '';
  const files = loadFiles(flags);
  requireContentOrFiles(content, files);
  return sendChunks(session, channelId, { content, files, flags });
}

async function cmdReply(session, flags) {
  const channelId = assertSnowflake(flagString(flags, 'channel', 'channel-id'), 'channel id');
  const messageId = assertSnowflake(flagString(flags, 'message', 'message-id'), 'message id');
  const content = contentFromFlags(flags) || '';
  const files = loadFiles(flags);
  requireContentOrFiles(content, files);
  return sendChunks(session, channelId, {
    content,
    files,
    flags,
    reference: { messageId, channelId },
  });
}

async function cmdUpload(session, flags) {
  const files = loadFiles(flags);
  if (!files.length) throw new Error('upload requires --file');
  return cmdSend(session, flags);
}

async function cmdEdit(session, flags) {
  const channelId = assertSnowflake(flagString(flags, 'channel', 'channel-id'), 'channel id');
  const messageId = assertSnowflake(flagString(flags, 'message', 'message-id'), 'message id');
  const content = contentFromFlags(flags);
  if (content === undefined) throw new Error('edit requires --content');
  const chunks = splitMessage(content);
  if (chunks.length !== 1) {
    throw new Error('Edited content exceeds 2000 characters; Discord cannot store a split edit on one message');
  }
  return session.call('patch', messageRoute(channelId, messageId), {
    body: {
      content: chunks[0],
      allowed_mentions: buildAllowedMentions(flags),
    },
  });
}

async function cmdDelete(session, flags) {
  const channelId = assertSnowflake(flagString(flags, 'channel', 'channel-id'), 'channel id');
  const messageId = assertSnowflake(flagString(flags, 'message', 'message-id'), 'message id');
  await session.call('delete', messageRoute(channelId, messageId));
  return { deleted: true, channel_id: channelId, message_id: messageId };
}

async function cmdReact(session, flags) {
  const channelId = assertSnowflake(flagString(flags, 'channel', 'channel-id'), 'channel id');
  const messageId = assertSnowflake(flagString(flags, 'message', 'message-id'), 'message id');
  const emoji = flagString(flags, 'emoji', 'reaction');
  const encoded = encodeEmoji(emoji);
  const route = Routes.channelMessageOwnReaction(channelId, messageId, encoded);
  if (flagBool(flags, 'remove')) {
    await session.call('delete', route);
    return { removed: true, emoji };
  }
  await session.call('put', route);
  return { reacted: true, emoji };
}

async function cmdThread(session, flags) {
  const channelId = assertSnowflake(flagString(flags, 'channel', 'channel-id'), 'channel id');
  const name = flagString(flags, 'name');
  if (!name) throw new Error('thread requires --name');
  const autoArchive = flags['auto-archive']
    ? Number.parseInt(String(flags['auto-archive']), 10)
    : 1440;
  const body = { name, auto_archive_duration: autoArchive };
  const messageId = flagString(flags, 'message', 'message-id');
  if (messageId) {
    assertSnowflake(messageId, 'message id');
    return session.call('post', Routes.threads(channelId, messageId), { body });
  }
  if (flags.type) body.type = Number.parseInt(String(flags.type), 10);
  return session.call('post', Routes.threads(channelId), { body });
}

async function cmdHistory(session, flags) {
  const channelId = assertSnowflake(flagString(flags, 'channel', 'channel-id'), 'channel id');
  const limit = parseLimit(flagString(flags, 'limit'), 50, { min: 1, max: DISCORD_HISTORY_MAX });
  const params = { limit };
  const before = flagString(flags, 'before');
  const after = flagString(flags, 'after');
  const around = flagString(flags, 'around');
  if (before) params.before = assertSnowflake(before, 'before');
  if (after) params.after = assertSnowflake(after, 'after');
  if (around) params.around = assertSnowflake(around, 'around');
  return session.call('get', messagesRoute(channelId), { query: query(params) });
}

async function cmdMe(session) {
  return session.call('get', Routes.user('@me'));
}

module.exports = {
  cmdSend,
  cmdReply,
  cmdUpload,
  cmdEdit,
  cmdDelete,
  cmdReact,
  cmdThread,
  cmdHistory,
  cmdMe,
  sendChunks,
};
