'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../src/cli/parse');

describe('parseArgs', () => {
  it('parses commands, flags, and repeatable --file', () => {
    const args = parseArgs([
      'send',
      '--agent',
      'GrokBot',
      '--channel',
      '123456789012345678',
      '--content=hello',
      '--file',
      'a.png',
      '--file',
      'b.png',
    ]);
    assert.deepEqual(args._, ['send']);
    assert.equal(args.flags.agent, 'GrokBot');
    assert.equal(args.flags.content, 'hello');
    assert.deepEqual(args.flags.file, ['a.png', 'b.png']);
  });

  it('rejects prototype-polluting flag names', () => {
    assert.throws(() => parseArgs(['send', '--constructor', 'x']));
  });
});
