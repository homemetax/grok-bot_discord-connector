'use strict';

const { assertHttpUrl } = require('./validate');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response, body) {
  const header = response.headers.get('retry-after') || response.headers.get('Retry-After');
  if (header) {
    const seconds = Number.parseFloat(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  }
  if (body && typeof body === 'object' && Number.isFinite(body.retry_after)) {
    return Math.ceil(Number(body.retry_after) * 1000);
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
 * POST JSON to the agent's Grok Bot routine webhook.
 * Retries 429 using Retry-After / retry_after. Does not retry 401/403.
 * The sender key is sent in the configured header and is never logged.
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
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('Webhook sender key is empty');
  }
  if (typeof headerName !== 'string' || headerName.length === 0) {
    throw new Error('Webhook key header name is empty');
  }

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
          [headerName]: key,
        },
        body,
        signal: controller.signal,
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
        await sleep(Math.min(1000 * 2 ** attempt, 5000));
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
      if (err && err.status === 429 && attempt < maxRetries) {
        await sleep(err.retryAfterMs || 1000);
        continue;
      }
      if (attempt >= maxRetries) throw lastError;
      if (err && err.status && err.status < 500 && err.status !== 429) throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('Webhook request failed');
}

module.exports = { postWebhook, retryAfterMs };
