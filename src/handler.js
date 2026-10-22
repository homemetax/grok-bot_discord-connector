'use strict';

const { collectBotRoleIds } = require('./mentions');
const { isThreadChannel } = require('./allowlist');
const { evaluateInbound } = require('./inbound');
const { fetchChannelHistory } = require('./history');
const {
  buildPayload,
  authorNameFromDiscord,
  attachmentsFromDiscord,
  historyFromDiscordMessages,
} = require('./payload');
const { postWebhook } = require('./webhook');
const { requireEnv } = require('./env');
const { DISCORD_HISTORY_MAX } = require('./constants');

function describeMessage(message) {
  const channel = message.channel;
  const isDm = !message.guild;
  const isThread = !isDm && isThreadChannel(channel);
  const parentId = isThread ? channel.parentId || null : null;
  const threadId = isThread ? channel.id : null;
  const channelId = isThread ? parentId || channel.id : channel.id;
  return {
    isDm,
    isThread,
    parentId,
    threadId,
    /** Discord channel the message arrived in (thread id when in a thread). */
    contextChannelId: channel.id,
    /** Parent text/forum channel when in a thread; otherwise the channel. */
    payloadChannelId: channelId,
  };
}

function botRoleIdsForMessage(client, message) {
  const guild = message.guild;
  if (!guild) return [];
  const me = guild.members.me || (guild.members.cache && guild.members.cache.get(client.user.id));
  const roleIds = me && me.roles && me.roles.cache ? [...me.roles.cache.keys()] : [];
  return collectBotRoleIds(roleIds, guild.id);
}

function toEvent(client, message, desc) {
  const mentions = message.mentions || {};
  const users = mentions.users
    ? typeof mentions.users.keys === 'function'
      ? [...mentions.users.keys()]
      : []
    : [];
  const roles = mentions.roles
    ? typeof mentions.roles.keys === 'function'
      ? [...mentions.roles.keys()]
      : []
    : [];
  return {
    botUserId: client.user && client.user.id,
    authorId: message.author && message.author.id,
    authorIsBot: Boolean(message.author && message.author.bot),
    isDm: desc.isDm,
    isSystem: Boolean(message.system),
    channelId: desc.contextChannelId,
    parentId: desc.parentId,
    mentionedUserIds: users,
    mentionedRoleIds: roles,
    mentionEveryone: Boolean(mentions.everyone),
  };
}

async function handleMessageCreate(runtime, message) {
  const { client, agent, loopGuard, log, env } = runtime;

  try {
    if (message.partial && typeof message.fetch === 'function') {
      message = await message.fetch();
    }
  } catch (err) {
    log.warn('failed to fetch partial message', err);
    return;
  }

  const desc = describeMessage(message);
  const event = toEvent(client, message, desc);
  const policy = {
    agentName: agent.name,
    allowedChannelIds: agent.allowed_channel_ids,
    enableDms: agent.enable_dms,
    botRoleIds: botRoleIdsForMessage(client, message),
  };

  const decision = evaluateInbound(event, policy, loopGuard);
  if (decision.action !== 'forward') {
    log.debug(`ignore ${message.id}: ${decision.reason}`);
    return;
  }

  let url;
  let key;
  try {
    url = requireEnv(agent.webhook_url_env, env);
    key = requireEnv(agent.webhook_key_env, env);
  } catch (err) {
    log.error(err.message);
    return;
  }

  if (event.authorIsBot) {
    loopGuard.record(decision.contextKey);
  }

  const historyLimit = Math.min(agent.history_limit, DISCORD_HISTORY_MAX);
  let history = [];
  try {
    if (message.channel && typeof message.channel.messages?.fetch === 'function') {
      history = await fetchChannelHistory(message.channel, {
        before: message.id,
        limit: historyLimit,
      });
    }
  } catch (err) {
    log.warn('history fetch failed; forwarding without history', err);
  }

  const payload = buildPayload({
    agent: agent.name,
    guild_id: message.guild ? message.guild.id : null,
    channel_id: desc.payloadChannelId,
    thread_id: desc.threadId,
    msg_id: message.id,
    author: {
      id: message.author.id,
      name: authorNameFromDiscord(message),
      is_bot: Boolean(message.author.bot),
    },
    content: message.content == null ? '' : String(message.content),
    history: historyFromDiscordMessages(history),
    attachments: attachmentsFromDiscord(message),
  });

  try {
    const result = await postWebhook({
      url,
      key,
      headerName: agent.webhook_key_header,
      payload,
      timeoutMs: agent.webhook_timeout_ms,
    });
    log.info(`forwarded ${message.id} -> webhook HTTP ${result.status}`);
  } catch (err) {
    log.error('webhook POST failed', err);
  }
}

module.exports = { handleMessageCreate, describeMessage, toEvent };
