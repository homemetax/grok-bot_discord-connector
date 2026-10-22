'use strict';

/**
 * pm2 process file.
 *
 * Multi-client (default): one process logs in every agent in config/agents.json.
 * One process per bot: duplicate the app block and set DISCORD_AGENT.
 *
 *   pm2 start deploy/ecosystem.config.js
 *   pm2 start deploy/ecosystem.config.js --only grok-discord-miya
 */

const path = require('node:path');

const root = path.join(__dirname, '..');

const base = {
  cwd: root,
  script: 'src/index.js',
  interpreter: 'node',
  instances: 1,
  autorestart: true,
  watch: false,
  max_memory_restart: '300M',
  kill_timeout: 8000,
  env: {
    NODE_ENV: 'production',
    CONFIG_PATH: path.join(root, 'config', 'agents.json'),
  },
};

module.exports = {
  apps: [
    {
      ...base,
      name: 'grok-discord',
    },
    // One-process-per-bot examples. Enable by copying and filling DISCORD_AGENT.
    // {
    //   ...base,
    //   name: 'grok-discord-miya',
    //   env: { ...base.env, DISCORD_AGENT: 'miya' },
    // },
    // {
    //   ...base,
    //   name: 'grok-discord-scar',
    //   env: { ...base.env, DISCORD_AGENT: 'scar' },
    // },
  ],
};
