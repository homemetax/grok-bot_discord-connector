'use strict';

const { THREAD_CHANNEL_TYPES } = require('./constants');

const THREAD_TYPES = new Set(THREAD_CHANNEL_TYPES);

/**
 * True only for Discord threads / forum posts — not for text channels
 * sitting under a category (`parentId` of a category is not a thread parent).
 */
function isThreadChannel(channel) {
  if (!channel) return false;
  if (typeof channel.isThread === 'function') return Boolean(channel.isThread());
  return THREAD_TYPES.has(channel.type);
}

/**
 * Channel allowlist.
 *
 * Guild messages are accepted when the channel id is listed, or when the
 * message is in a thread whose parent channel id is listed (including
 * forum posts). DMs are rejected unless enableDms is true. An empty
 * allowlist rejects every guild channel. Category ids are not implicit
 * allowlists for their children.
 */

function isChannelAllowed(location = {}, policy = {}) {
  const isDm = Boolean(location.isDm);
  const enableDms = Boolean(policy.enableDms);
  if (isDm) return enableDms;

  const channelId = location.channelId == null ? '' : String(location.channelId);
  const parentId = location.parentId == null || location.parentId === ''
    ? null
    : String(location.parentId);

  const allowed = new Set(
    (policy.allowedChannelIds || []).filter((id) => id != null && id !== '').map(String),
  );

  if (channelId && allowed.has(channelId)) return true;
  if (parentId && allowed.has(parentId)) return true;
  return false;
}

module.exports = { isChannelAllowed, isThreadChannel };
