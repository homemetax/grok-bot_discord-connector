'use strict';

const BLOCKED_FLAG_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function pushFlag(flags, key, value) {
  if (BLOCKED_FLAG_KEYS.has(key) || key.includes('__')) {
    throw new Error(`Invalid flag name: ${key}`);
  }
  if (Object.prototype.hasOwnProperty.call(flags, key)) {
    const cur = flags[key];
    flags[key] = Array.isArray(cur) ? cur.concat(value) : [cur, value];
  } else {
    flags[key] = value;
  }
}

function parseArgs(argv) {
  const args = { _: [], flags: Object.create(null) };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') {
      args._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        pushFlag(args.flags, a.slice(2, eq), a.slice(eq + 1));
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        pushFlag(args.flags, key, next);
        i += 1;
      } else {
        pushFlag(args.flags, key, true);
      }
      continue;
    }
    args._.push(a);
  }
  return args;
}

function asArray(value) {
  if (value === undefined || value === null || value === false) return [];
  return Array.isArray(value) ? value : [value];
}

function flagString(flags, ...keys) {
  for (const key of keys) {
    if (flags[key] !== undefined && flags[key] !== true) return String(flags[key]);
  }
  return undefined;
}

function flagBool(flags, key) {
  const v = flags[key];
  if (v === false || v === 'false' || v === '0' || v === 'no') return false;
  return Boolean(v);
}

module.exports = { parseArgs, asArray, flagString, flagBool };
