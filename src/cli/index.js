'use strict';

const path = require('node:path');
const { loadEnvFile } = require('../env');
const { loadConfig, findAgent } = require('../config');
const { restForAgent } = require('../rest');
const { wrapDiscordError, exitCodeForError } = require('../discord-error');
const { parseArgs } = require('./parse');
const {
  cmdSend,
  cmdReply,
  cmdUpload,
  cmdEdit,
  cmdDelete,
  cmdReact,
  cmdThread,
  cmdHistory,
  cmdMe,
} = require('./messages');
const { cmdChannel, cmdRole } = require('./guild');

const HELP = `Usage: node bin/discord.js <command> [subcommand] [options]

Outbound Discord REST CLI. Uses the agent's bot token from the environment.
Message content is never executed. Default allowed_mentions blocks @everyone
and role pings.

Commands:
  send       Send a message to a channel or thread
  reply      Reply to a message (first chunk is the reply; extras follow)
  react      Add (--emoji) or remove (--emoji --remove) a reaction
  thread     Create a thread (--name, optional --message)
  history    Fetch recent messages (max 100)
  upload     Send with one or more --file attachments
  edit       Edit a message sent by this bot
  delete     Delete a message sent by this bot
  me         Print this bot's user object
  channel    list|get|create|edit|delete
  role       list|get|create|edit|delete|add|remove

Global options:
  --agent NAME       Agent from config (or DISCORD_AGENT)
  --config PATH      Config JSON (or CONFIG_PATH)
  --help             Show this help

Message options:
  --channel ID       Channel or thread snowflake (use thread_id when in a thread)
  --message ID       Message snowflake
  --content TEXT     Message text (split automatically at 2000 characters)
  --file PATH        Attachment (repeatable)
  --emoji EMOJI      Unicode or custom name:id / <:name:id>
  --limit N          History limit 1-100
  --no-mentions      allowed_mentions.parse = []
  --allow-everyone   Opt in to @everyone/@here (off by default)
  --allow-roles      Opt in to role mentions (off by default)

Channel/role options:
  --guild ID         Guild snowflake
  --name NAME
  --type N           Discord channel type integer
  --role ID
  --user ID
  --permissions INT  Discord permission bitfield (passed through; no local cap)
  --color HEX

When thread_id is present on an inbound payload, pass it as --channel so the
reply lands in that thread.

Exit codes: 0 ok, 1 usage/other, 2 unauthorized (401), 3 forbidden (403),
4 rate limited (429).
`;

function printHelp() {
  process.stdout.write(HELP);
}

function resolveAgentName(flags, env) {
  if (flags.agent && flags.agent !== true) return String(flags.agent);
  if (env.DISCORD_AGENT) return env.DISCORD_AGENT;
  return undefined;
}

async function dispatch(command, sub, session, flags) {
  switch (command) {
    case 'send':
      return cmdSend(session, flags);
    case 'reply':
      return cmdReply(session, flags);
    case 'upload':
      return cmdUpload(session, flags);
    case 'edit':
      return cmdEdit(session, flags);
    case 'delete':
      return cmdDelete(session, flags);
    case 'react':
      return cmdReact(session, flags);
    case 'thread':
      return cmdThread(session, flags);
    case 'history':
      return cmdHistory(session, flags);
    case 'me':
      return cmdMe(session);
    case 'channel':
      return cmdChannel(session, sub, flags);
    case 'role':
      return cmdRole(session, sub, flags);
    default:
      throw new Error(`Unknown command "${command}". Use --help.`);
  }
}

async function runCli(argv, { env = process.env, cwd = process.cwd(), stdout = process.stdout } = {}) {
  const { _, flags } = parseArgs(argv);
  if (flags.help || flags.h || _.includes('help') || _.length === 0) {
    printHelp();
    return 0;
  }

  loadEnvFile(path.join(cwd, '.env'), env);
  const config = loadConfig({
    env,
    cwd,
    filePath: flags.config && flags.config !== true ? String(flags.config) : undefined,
  });
  const agent = findAgent(config, resolveAgentName(flags, env));
  const session = restForAgent(agent, env);
  const command = _[0];
  const sub = _[1];

  const result = await dispatch(command, sub, session, flags);
  if (result !== undefined) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  return 0;
}

async function main(argv = process.argv.slice(2)) {
  try {
    const code = await runCli(argv);
    return code;
  } catch (err) {
    const wrapped = err && err.status ? err : wrapDiscordError(err);
    process.stderr.write(`${wrapped.message}\n`);
    return exitCodeForError(wrapped);
  }
}

module.exports = { runCli, main, HELP };
