'use strict';

const { assertHttpUrl, assertHeaderName, assertHeaderValue } = require('./validate');
const { MAX_WEBHOOK_RETRY_AFTER_MS } = require('./constants');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function capWaitMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 1000;
  return Math.min(Math.ceil(ms), MAX_WEBHOOK_RETRY_AFTER_MS);
}

function retryAfterMs(response, body) {
  const header = response.headers.get('retry-after') || response.headers.get('Retry-After');
  if (header) {
    const seconds = Number.parseFloat(header);
    if (Number.isFinite(seconds) && seconds >= 0) return capWaitMs(seconds * 1000);
    const when = Date.parse(header);
    if (Number.isFinite(when)) return capWaitMs(when - Date.now());
  }
  if (body && typeof body === 'object' && Number.isFinite(body.retry_after)) {
    return capWaitMs(Number(body.retry_after) * 1000);
  }
  return 1000;
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Grok Bot routines expect Authorization: Bearer <key>.
 * Other header names get the raw key. Do not double-prefix Bearer.
 */
function formatSenderKey(headerName, key) {
  if (String(headerName).toLowerCase() === 'authorization' && !key.startsWith('Bearer ')) {
    return `Bearer ${key}`;
  }
  return key;
}

/**
 * POST JSON to the agent's Grok Bot routine webhook.
 * Retries 429 using Retry-After / retry_after (capped). Does not retry 401/403.
 * Does not follow redirects (would leak the sender key to a third party).
 * The sender key is sent in the configured header and is never logged.
 * Default header is Authorization, with a Bearer prefix unless the key already has one.
 */
async function postWebhook({
  url,
  key,
  headerName,
  payload,
  timeoutMs = 30000,
  fetchImpl = globalThis.fetch,
  maxRetries = 3,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available; Node.js 18+ is required');
  }
  const endpoint = assertHttpUrl(url, 'webhook URL');
  const safeHeader = assertHeaderName(headerName);
  const safeKey = formatSenderKey(safeHeader, assertHeaderValue(key, 'Webhook sender key'));

  const body = JSON.stringify(payload);
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          [safeHeader]: safeKey,
        },
        body,
        signal: controller.signal,
        redirect: 'error',
      });

      if (response.status === 401 || response.status === 403) {
        const errBody = await readBody(response);
        const err = new Error(`Webhook rejected the request (${response.status})`);
        err.status = response.status;
        err.body = errBody;
        throw err;
      }

      if (response.status === 429) {
        const errBody = await readBody(response);
        const wait = retryAfterMs(response, errBody);
        lastError = new Error(`Webhook rate limited (429); retry_after_ms=${wait}`);
        lastError.status = 429;
        lastError.retryAfterMs = wait;
        if (attempt === maxRetries) throw lastError;
        await sleep(wait);
        continue;
      }

      if (response.status >= 500 && attempt < maxRetries) {
        lastError = new Error(`Webhook server error (${response.status})`);
        lastError.status = response.status;
        await sleep(capWaitMs(Math.min(1000 * 2 ** attempt, 5000)));
        continue;
      }

      if (!response.ok) {
        const errBody = await readBody(response);
        const err = new Error(`Webhook HTTP ${response.status}`);
        err.status = response.status;
        err.body = errBody;
        throw err;
      }

      return { status: response.status, body: await readBody(response) };
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) throw err;
      if (err && err.name === 'AbortError') {
        lastError = new Error(`Webhook request timed out after ${timeoutMs}ms`);
        lastError.status = 408;
      } else {
        lastError = err;
      }
      if (err && err.status && err.status < 500 && err.status !== 429) throw lastError;
      if (attempt >= maxRetries) throw lastError;
      if (err && err.status === 429) {
        await sleep(capWaitMs(err.retryAfterMs || 1000));
        continue;
      }
      await sleep(capWaitMs(250 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('Webhook request failed');
}

module.exports = { postWebhook, retryAfterMs, capWaitMs, formatSenderKey };
