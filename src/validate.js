'use strict';

const { SNOWFLAKE_RE, AGENT_NAME_RE, ENV_NAME_RE, HEADER_NAME_RE } = require('./constants');

function isSnowflake(id) {
  if (id == null) return false;
  return SNOWFLAKE_RE.test(String(id));
}

function assertSnowflake(id, label = 'id') {
  if (!isSnowflake(id)) {
    throw new Error(`Invalid ${label}: expected a Discord snowflake (17-20 digit id)`);
  }
  return String(id);
}

function assertAgentName(name) {
  if (typeof name !== 'string' || !AGENT_NAME_RE.test(name)) {
    throw new Error('Invalid agent name: use 1-64 letters, digits, underscore, or hyphen');
  }
  return name;
}

function assertEnvName(name, label = 'env var') {
  if (typeof name !== 'string' || !ENV_NAME_RE.test(name)) {
    throw new Error(`Invalid ${label} name ${JSON.stringify(name)}`);
  }
  return name;
}

function assertHeaderName(name) {
  if (typeof name !== 'string' || !HEADER_NAME_RE.test(name)) {
    throw new Error('Invalid webhook key header name');
  }
  return name;
}

function assertPositiveInt(value, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${label}: expected integer between ${min} and ${max}`);
  }
  return value;
}

function parseLimit(value, fallback, { min = 1, max = 100 } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return assertPositiveInt(n, 'limit', { min, max });
}

function assertHttpUrl(raw, label = 'url') {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Error(`Invalid ${label}: not a URL`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Invalid ${label}: only http(s) is allowed`);
  }
  return url.toString();
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

module.exports = {
  isSnowflake,
  assertSnowflake,
  assertAgentName,
  assertEnvName,
  assertHeaderName,
  assertPositiveInt,
  parseLimit,
  assertHttpUrl,
  assertNonEmptyString,
};
