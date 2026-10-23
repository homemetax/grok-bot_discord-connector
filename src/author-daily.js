'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  AGENT_NAME_RE,
  AUTHOR_DAILY_WINDOW_MS,
} = require('./constants');

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function emptyState() {
  return { version: 1, agents: Object.create(null) };
}

function isSafeKey(key) {
  if (key == null) return false;
  const s = String(key);
  if (!s || s.length > 64) return false;
  return !FORBIDDEN_KEYS.has(s);
}

function normalizeTimes(times) {
  if (!Array.isArray(times)) return [];
  const out = [];
  for (const t of times) {
    const n = typeof t === 'number' ? t : Number(t);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

function normalizeState(raw) {
  const state = emptyState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
  const agents = raw.agents;
  if (!agents || typeof agents !== 'object' || Array.isArray(agents)) return state;

  for (const [agentName, authors] of Object.entries(agents)) {
    if (!isSafeKey(agentName)) continue;
    if (!AGENT_NAME_RE.test(agentName)) continue;
    if (!authors || typeof authors !== 'object' || Array.isArray(authors)) continue;
    const cleaned = Object.create(null);
    for (const [authorId, times] of Object.entries(authors)) {
      if (!isSafeKey(authorId)) continue;
      cleaned[String(authorId)] = normalizeTimes(times);
    }
    state.agents[agentName] = cleaned;
  }
  return state;
}

function pruneTimes(times, now, windowMs) {
  return times.filter((t) => now - t < windowMs);
}

function pruneState(state, now, windowMs) {
  const agents = Object.create(null);
  for (const [agentName, authors] of Object.entries(state.agents || {})) {
    const cleaned = Object.create(null);
    for (const [authorId, times] of Object.entries(authors || {})) {
      const kept = pruneTimes(times, now, windowMs);
      if (kept.length) cleaned[authorId] = kept;
    }
    if (Object.keys(cleaned).length) agents[agentName] = cleaned;
  }
  return { version: 1, agents };
}

/**
 * Write JSON by creating a sibling temp file and renaming over the target.
 * rename(2) on the same filesystem is atomic; readers never see a partial file.
 */
function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  const json = `${JSON.stringify(data)}\n`;
  try {
    fs.writeFileSync(tmp, json, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore cleanup
    }
    throw err;
  }
}

function readState(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return emptyState();
    throw err;
  }
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

function exemptSet(exemptIds) {
  const set = new Set();
  if (!Array.isArray(exemptIds)) return set;
  for (const id of exemptIds) {
    if (id != null && id !== '') set.add(String(id));
  }
  return set;
}

/**
 * Rolling 24h forward counts, keyed by agent + author.
 * Persist to a small JSON file so counts survive process restarts.
 */
class AuthorDailyLimiter {
  constructor({
    filePath = null,
    now = () => Date.now(),
    windowMs = AUTHOR_DAILY_WINDOW_MS,
  } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.windowMs = windowMs;
    this.state = this.filePath ? readState(this.filePath) : emptyState();
  }

  _load() {
    if (this.filePath) this.state = readState(this.filePath);
    return this.state;
  }

  _persist(state) {
    this.state = state;
    if (!this.filePath) return;
    writeJsonAtomic(this.filePath, state);
  }

  _times(state, agentName, authorId) {
    const authors = state.agents[agentName];
    if (!authors) return [];
    return authors[authorId] ? authors[authorId].slice() : [];
  }

  _setTimes(state, agentName, authorId, times) {
    if (!state.agents[agentName]) state.agents[agentName] = Object.create(null);
    if (times.length === 0) {
      delete state.agents[agentName][authorId];
      if (Object.keys(state.agents[agentName]).length === 0) {
        delete state.agents[agentName];
      }
      return;
    }
    state.agents[agentName][authorId] = times;
  }

  count(agentName, authorId) {
    const now = this.now();
    const state = pruneState(this._load(), now, this.windowMs);
    return this._times(state, String(agentName), String(authorId)).length;
  }

  /**
   * Record one forward if the author is under the per-agent daily cap.
   * limit <= 0 disables the check. Exempt author ids skip the cap and are not counted.
   *
   * @returns {{ allowed: boolean, reason: string, count: number }}
   */
  tryConsume({ agentName, authorId, limit = 0, exemptIds = [] } = {}) {
    const cap = Number(limit);
    if (!Number.isInteger(cap) || cap <= 0) {
      return { allowed: true, reason: 'off', count: 0 };
    }
    if (agentName == null || authorId == null || authorId === '') {
      return { allowed: false, reason: 'rate_limited', count: 0 };
    }

    const agent = String(agentName);
    const author = String(authorId);
    if (exemptSet(exemptIds).has(author)) {
      return { allowed: true, reason: 'exempt', count: 0 };
    }

    const now = this.now();
    const state = pruneState(this._load(), now, this.windowMs);
    const times = pruneTimes(this._times(state, agent, author), now, this.windowMs);
    if (times.length >= cap) {
      this._setTimes(state, agent, author, times);
      this._persist(state);
      return { allowed: false, reason: 'rate_limited', count: times.length };
    }
    times.push(now);
    this._setTimes(state, agent, author, times);
    this._persist(state);
    return { allowed: true, reason: 'ok', count: times.length };
  }
}

module.exports = {
  AuthorDailyLimiter,
  writeJsonAtomic,
  normalizeState,
  emptyState,
};
