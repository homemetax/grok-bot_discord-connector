'use strict';

const { DISCORD_CONTENT_LIMIT } = require('./constants');

/**
 * Split text into Discord-safe chunks (default 2000 characters).
 * Prefers paragraph breaks, then newlines, then spaces; otherwise a hard cut.
 * Never returns a chunk longer than maxLength.
 */
function splitMessage(text, maxLength = DISCORD_CONTENT_LIMIT) {
  if (text == null) return [''];
  if (typeof text !== 'string') {
    throw new TypeError('text must be a string');
  }
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new RangeError('maxLength must be a positive integer');
  }
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength);
    const breakAt = findBreakIndex(window);
    if (breakAt <= 0) {
      chunks.push(window);
      remaining = remaining.slice(maxLength);
      continue;
    }
    const chunk = remaining.slice(0, breakAt).replace(/[ \t]+$/u, '');
    if (!chunk.length) {
      chunks.push(window);
      remaining = remaining.slice(maxLength);
      continue;
    }
    chunks.push(chunk);
    remaining = remaining.slice(breakAt).replace(/^[ \t\n\r]+/u, '');
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

function findBreakIndex(window) {
  const min = Math.floor(window.length * 0.4);
  const paragraph = window.lastIndexOf('\n\n');
  if (paragraph >= min) return paragraph;
  const line = window.lastIndexOf('\n');
  if (line >= min) return line;
  const space = window.lastIndexOf(' ');
  if (space >= min) return space;
  return window.length;
}

module.exports = { splitMessage, findBreakIndex, DISCORD_CONTENT_LIMIT };
