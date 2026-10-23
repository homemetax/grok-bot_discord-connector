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
 * Optional channel allowlist.
 *
 * Missing or empty allowedChannelIds: any guild channel or thread the
 * bot can see (Discord role / overwrite permissions are the gate).
 * Non-empty: accept only listed channel ids, or threads whose parent
 * is listed (including forum posts). Category ids are not implicit
 * allowlists for their children. DMs are rejected unless enableDms.
 */

function isChannelAllowed(location = {}, policy = {}) {
  const isDm = Boolean(location.isDm);
  const enableDms = Boolean(policy.enableDms);
  if (isDm) return enableDms;

  const channelId = location.channelId == null ? '' : String(location.channelId);
  const parentId = location.parentId == null || location.parentId === ''
    ? null
    : String(location.parentId);

  const rawIds = policy.allowedChannelIds;
  const allowed = new Set(
    (Array.isArray(rawIds) ? rawIds : []).filter((id) => id != null && id !== '').map(String),
  );

  if (allowed.size === 0) {
    return Boolean(channelId);
  }

  if (channelId && allowed.has(channelId)) return true;
  if (parentId && allowed.has(parentId)) return true;
  return false;
}

module.exports = { isChannelAllowed, isThreadChannel };
