'use strict';

const path = require('node:path');
const { loadEnvFile } = require('./env');
const { loadConfig, selectAgents } = require('./config');
const { createRuntime, loginRuntime, destroyRuntime } = require('./runtime');
const { createLogger } = require('./logger');

async function main({ env = process.env, cwd = process.cwd() } = {}) {
  loadEnvFile(path.join(cwd, '.env'), env);
  const log = createLogger(null, env);
  const config = loadConfig({ env, cwd });
  const agents = selectAgents(config, env);

  if (agents.length === 1) {
    log.info(`starting single agent process: ${agents[0].name} (config ${config.config_path})`);
  } else {
    log.info(
      `starting multi-client process: ${agents.map((a) => a.name).join(', ')} (config ${config.config_path})`,
    );
  }

  const runtimes = [];
  const failures = [];

  for (const agent of agents) {
    const runtime = createRuntime(agent, { env });
    try {
      await loginRuntime(runtime, env);
      runtimes.push(runtime);
    } catch (err) {
      failures.push({ name: agent.name, err });
    }
  }

  if (runtimes.length === 0) {
    log.error('no Discord clients logged in; exiting');
    process.exitCode = 1;
    return runtimes;
  }

  if (failures.length) {
    for (const f of failures) {
      log.error(`agent ${f.name} failed to login and was skipped`);
    }
  }

  const shutdown = (signal) => {
    log.info(`received ${signal}; shutting down ${runtimes.length} client(s)`);
    for (const rt of runtimes) destroyRuntime(rt);
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (err) => {
    log.error('unhandledRejection', err);
  });

  return runtimes;
}

if (require.main === module) {
  main().catch((err) => {
    const log = createLogger();
    log.error(err);
    process.exit(1);
  });
}

module.exports = { main };
