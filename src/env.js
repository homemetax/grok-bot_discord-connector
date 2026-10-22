'use strict';

const fs = require('node:fs');

/**
 * Load KEY=VALUE pairs from a .env file into process.env.
 * Does not override variables that are already set (systemd/pm2 win).
 * Never logs file contents.
 */
function loadEnvFile(filePath, env = process.env) {
  if (!filePath) return;
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }

  for (const originalLine of raw.split(/\r?\n/)) {
    let line = originalLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
}

function requireEnv(name, env = process.env) {
  if (!name || typeof name !== 'string') {
    throw new Error('Environment variable name is required');
  }
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

module.exports = { loadEnvFile, requireEnv };
