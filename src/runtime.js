'use strict';

const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { LoopGuard } = require('./loop-guard');
const { handleMessageCreate } = require('./handler');
const { createLogger } = require('./logger');
const { requireEnv } = require('./env');

const INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.MessageContent,
];

const PARTIALS = [Partials.Channel, Partials.Message, Partials.Reaction];

function createClient() {
  return new Client({
    intents: INTENTS,
    partials: PARTIALS,
    rest: {
      retries: 1,
    },
  });
}

function createRuntime(agent, { env = process.env, ClientImpl = Client } = {}) {
  const log = createLogger(agent.name, env);
  const loopGuard = new LoopGuard({
    maxBotExchanges: agent.loop_guard.max_bot_exchanges,
    windowMs: agent.loop_guard.window_ms,
    cooldownMs: agent.loop_guard.cooldown_ms,
  });

  const client = ClientImpl === Client
    ? createClient()
    : new ClientImpl({ intents: INTENTS, partials: PARTIALS });

  const runtime = { agent, client, loopGuard, log, env };

  client.on(Events.ClientReady, (readyClient) => {
    log.info(`logged in as ${readyClient.user.tag} id=${readyClient.user.id}`);
  });

  client.on(Events.Error, (err) => {
    log.error('client error', err);
  });

  client.on(Events.Warn, (msg) => {
    log.warn(msg);
  });

  client.on(Events.MessageCreate, (message) => {
    handleMessageCreate(runtime, message).catch((err) => {
      log.error('unhandled inbound error', err);
    });
  });

  return runtime;
}

async function loginRuntime(runtime, env = process.env) {
  const token = requireEnv(runtime.agent.token_env, env);
  try {
    await runtime.client.login(token);
  } catch (err) {
    runtime.log.error('login failed', err);
    try {
      runtime.client.destroy();
    } catch {
      // ignore
    }
    throw err;
  }
  return runtime;
}

function destroyRuntime(runtime) {
  try {
    runtime.client.destroy();
  } catch {
    // ignore
  }
}

module.exports = {
  INTENTS,
  PARTIALS,
  createClient,
  createRuntime,
  loginRuntime,
  destroyRuntime,
};
