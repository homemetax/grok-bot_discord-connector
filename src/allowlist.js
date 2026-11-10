'use strict';

const { THREAD_CHANNEL_TYPES } = require('./constants');

const THREAD_TYPES = new Set(THREAD_CHANNEL_TYPES);
const OPEN_CHANNEL_ID = '*';

/**
 * True only for Discord threads / forum posts, not for text channels
 * sitting under a category (`parentId` of a category is not a thread parent).
 */
function isThreadChannel(channel) {
  if (!channel) return false;
  if (typeof channel.isThread === 'function') return Boolean(channel.isThread());
  return THREAD_TYPES.has(channel.type);
}

function isOpenChannelAllowlist(ids) {
  return Array.isArray(ids) && ids.length === 1 && String(ids[0]) === OPEN_CHANNEL_ID;
}

/**
 * Required channel allowlist.
 *
 * `["*"]`: any guild channel or thread the bot can see (Discord role /
 * overwrite permissions are the gate). A list of snowflakes: those
 * channels, plus threads whose parent is listed. Category ids are not
 * implicit allowlists for their children. DMs are rejected unless enableDms.
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
  if (isOpenChannelAllowlist(rawIds)) {
    return Boolean(channelId);
  }

  const allowed = new Set(
    (Array.isArray(rawIds) ? rawIds : []).filter((id) => id != null && id !== '').map(String),
  );

  if (channelId && allowed.has(channelId)) return true;
  if (parentId && allowed.has(parentId)) return true;
  return false;
}

/**
 * One WARN per agent whose allowlist is ["*"]. Call once at process start.
 * @param {Array<{ name?: string, allowed_channel_ids?: string[] }>} agents
 * @param {{ warn: (msg: string) => void }} log
 */
function warnOpenAllowlists(agents, log) {
  if (!log || typeof log.warn !== 'function') return;
  for (const agent of agents || []) {
    if (!isOpenChannelAllowlist(agent && agent.allowed_channel_ids)) continue;
    const name = agent.name || 'agent';
    log.warn(
      `${name}: allowed_channel_ids is ["*"]; this agent accepts any guild channel the bot can see`,
    );
  }
}

module.exports = {
  OPEN_CHANNEL_ID,
  isChannelAllowed,
  isThreadChannel,
  isOpenChannelAllowlist,
  warnOpenAllowlists,
};
