'use strict';

const { isBotMentioned } = require('./mentions');
const { isChannelAllowed } = require('./allowlist');
const { contextKey } = require('./loop-guard');

/**
 * Pure inbound gate. Discord content is treated as untrusted data: this
 * function never executes message text.
 *
 * @returns {{ action: 'ignore', reason: string } | { action: 'forward', contextKey: string }}
 */
function evaluateInbound(event, policy, loopGuard) {
  if (!event || !policy) {
    return { action: 'ignore', reason: 'invalid' };
  }
  if (event.isSystem) {
    return { action: 'ignore', reason: 'system' };
  }

  const botUserId = event.botUserId == null ? '' : String(event.botUserId);
  const authorId = event.authorId == null ? '' : String(event.authorId);
  if (!botUserId || !authorId) {
    return { action: 'ignore', reason: 'invalid' };
  }
  if (authorId === botUserId) {
    return { action: 'ignore', reason: 'own_message' };
  }

  const allowed = isChannelAllowed(
    {
      channelId: event.channelId,
      parentId: event.parentId,
      isDm: event.isDm,
    },
    {
      allowedChannelIds: policy.allowedChannelIds,
      enableDms: policy.enableDms,
    },
  );
  if (!allowed) {
    return { action: 'ignore', reason: event.isDm ? 'dm_disabled' : 'not_allowlisted' };
  }

  const mentioned = isBotMentioned({
    botUserId,
    botRoleIds: policy.botRoleIds || [],
    mentionedUserIds: event.mentionedUserIds || [],
    mentionedRoleIds: event.mentionedRoleIds || [],
    mentionEveryone: Boolean(event.mentionEveryone),
  });
  if (!mentioned) {
    return { action: 'ignore', reason: 'not_mentioned' };
  }

  const key = contextKey(policy.agentName, event.channelId);
  const decision = loopGuard.allow(key, { isBot: Boolean(event.authorIsBot) });
  if (!decision.allowed) {
    return { action: 'ignore', reason: `loop_guard_${decision.reason}` };
  }

  return { action: 'forward', contextKey: key };
}

module.exports = { evaluateInbound };
