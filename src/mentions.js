'use strict';

/**
 * Mention detection for inbound MESSAGE_CREATE.
 *
 * Triggers only on an explicit user mention of this bot or (when
 * mentionMode is `user_or_role`, the default) an explicit mention of
 * one of this bot's roles. `user_only` ignores role mentions.
 * @everyone and @here are never treated as a mention of the bot,
 * even if mention_everyone is true.
 *
 * The @everyone role id (guild id) is excluded from bot roles.
 */

function collectBotRoleIds(roleIds, guildId) {
  const ids = Array.isArray(roleIds) ? roleIds : [];
  const everyoneId = guildId == null ? null : String(guildId);
  const out = [];
  const seen = new Set();
  for (const id of ids) {
    if (id == null) continue;
    const s = String(id);
    if (everyoneId && s === everyoneId) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function isBotMentioned({
  botUserId,
  botRoleIds = [],
  mentionedUserIds = [],
  mentionedRoleIds = [],
  mentionEveryone = false, // accepted for callers; never used as a trigger
  mentionMode = 'user_or_role',
} = {}) {
  void mentionEveryone;
  if (botUserId == null || botUserId === '') return false;
  const botId = String(botUserId);

  for (const id of mentionedUserIds || []) {
    if (id != null && String(id) === botId) return true;
  }

  if (mentionMode === 'user_only') return false;

  if (!mentionedRoleIds || !mentionedRoleIds.length) return false;
  if (!botRoleIds || !botRoleIds.length) return false;

  const roles = new Set((botRoleIds || []).map(String));
  for (const id of mentionedRoleIds) {
    if (id != null && roles.has(String(id))) return true;
  }
  return false;
}

module.exports = { isBotMentioned, collectBotRoleIds };
