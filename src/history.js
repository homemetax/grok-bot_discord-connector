'use strict';

const { DISCORD_HISTORY_MAX } = require('./constants');

async function fetchChannelHistory(channel, { before, limit } = {}) {
  const n = Math.min(Math.max(1, limit || 20), DISCORD_HISTORY_MAX);
  const options = { limit: n };
  if (before) options.before = String(before);
  const collection = await channel.messages.fetch(options);
  const messages = [...collection.values()].sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp,
  );
  return messages.filter((m) => !before || m.id !== String(before));
}

module.exports = { fetchChannelHistory };
