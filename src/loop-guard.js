'use strict';

/**
 * Bot-to-bot loop guard.
 *
 * Humans are always allowed (and reset the exchange chain for that
 * channel/thread). Other bots are capped per context key (agent +
 * channel or thread id) inside a sliding window, with a cooldown
 * between accepted bot messages. Own-message filtering is not handled
 * here; callers must drop the bot's own messages first.
 */
class LoopGuard {
  constructor({
    maxBotExchanges = 6,
    windowMs = 120000,
    cooldownMs = 8000,
    now = () => Date.now(),
  } = {}) {
    this.maxBotExchanges = maxBotExchanges;
    this.windowMs = windowMs;
    this.cooldownMs = cooldownMs;
    this.now = now;
    /** @type {Map<string, { times: number[], lastAt: number }>} */
    this.exchanges = new Map();
  }

  _prune(state, now) {
    state.times = state.times.filter((t) => now - t < this.windowMs);
    return state;
  }

  allow(key, { isBot } = {}) {
    if (!isBot) {
      this.exchanges.delete(key);
      return { allowed: true };
    }

    const now = this.now();
    const state = this._prune(this.exchanges.get(key) || { times: [], lastAt: null }, now);

    if (state.lastAt != null && now - state.lastAt < this.cooldownMs) {
      return { allowed: false, reason: 'cooldown' };
    }
    if (state.times.length >= this.maxBotExchanges) {
      return { allowed: false, reason: 'cap' };
    }
    return { allowed: true };
  }

  record(key) {
    const now = this.now();
    const state = this._prune(this.exchanges.get(key) || { times: [], lastAt: null }, now);
    state.times.push(now);
    state.lastAt = now;
    this.exchanges.set(key, state);
  }
}

function contextKey(agentName, channelOrThreadId) {
  return `${agentName}:${channelOrThreadId}`;
}

module.exports = { LoopGuard, contextKey };
