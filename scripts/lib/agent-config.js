'use strict';

/**
 * Config helpers for teammate packaging scripts.
 * Writes only env *names* and agent metadata. Never writes secret values.
 */

const fs = require('node:fs');
const path = require('node:path');
const { assertAgentName, assertEnvName } = require('../../src/validate');
const { ENV_NAME_RE } = require('../../src/constants');

const SECRET_FLAGS = new Set([
  'token',
  'secret',
  'key',
  'webhook',
  'webhook-url',
  'webhook-key',
  'webhook_url',
  'webhook_key',
  'discord-token',
  'discord_token',
  'sender-key',
  'sender_key',
]);

function repoRoot() {
  return path.resolve(__dirname, '..', '..');
}

function defaultPaths(root = repoRoot()) {
  return {
    root,
    example: path.join(root, 'config', 'agents.example.json'),
    config: path.join(root, 'config', 'agents.json'),
    envExample: path.join(root, '.env.example'),
    envFile: path.join(root, '.env'),
  };
}

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgv(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      if (name === 'proto__' || name === 'constructor' || name === '__proto__') {
        throw new Error('Invalid flag name');
      }
      if (SECRET_FLAGS.has(name)) {
        throw new Error(
          'Refusing --' + name + ': these scripts never write secret values. Set tokens and keys in the environment.',
        );
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[name] = true;
      } else {
        flags[name] = next;
        i += 1;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
    throw err;
  }
}

function prefixFromName(name) {
  const prefix = String(name).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!ENV_NAME_RE.test(prefix)) {
    throw new Error(`Cannot derive an env prefix from agent name ${JSON.stringify(name)}`);
  }
  return prefix;
}

function assertPrefix(raw) {
  if (typeof raw !== 'string' || !ENV_NAME_RE.test(raw)) {
    throw new Error('Invalid env prefix: use a letter or underscore, then letters, digits, or underscore');
  }
  return raw;
}

function envNamesForPrefix(prefix) {
  const p = assertPrefix(prefix);
  return {
    token_env: assertEnvName(`${p}_DISCORD_TOKEN`, 'token_env'),
    webhook_url_env: assertEnvName(`${p}_WEBHOOK_URL`, 'webhook_url_env'),
    webhook_key_env: assertEnvName(`${p}_WEBHOOK_KEY`, 'webhook_key_env'),
  };
}

function readConfig(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.agents)) {
    throw new Error(`Config is missing an agents array: ${filePath}`);
  }
  return parsed;
}

function ensureConfig({ config, example }) {
  if (fs.existsSync(config)) return { created: false, path: config };
  if (!fs.existsSync(example)) {
    throw new Error(`Example config not found: ${example}`);
  }
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.copyFileSync(example, config);
  return { created: true, path: config };
}

function ensureEnvFile({ envFile, envExample }) {
  if (fs.existsSync(envFile)) return { created: false, path: envFile };
  if (!fs.existsSync(envExample)) return { created: false, path: envFile };
  fs.copyFileSync(envExample, envFile);
  return { created: true, path: envFile };
}

function listAgentNames(configPath) {
  return readConfig(configPath).agents.map((a) => {
    if (!a || typeof a.name !== 'string') throw new Error('Agent entry is missing a name');
    return a.name;
  });
}

function addAgent(configPath, { name, prefix }) {
  const agentName = assertAgentName(name);
  const env = envNamesForPrefix(prefix || prefixFromName(agentName));
  const config = readConfig(configPath);
  const clash = config.agents.find(
    (a) => a && typeof a.name === 'string' && a.name.toLowerCase() === agentName.toLowerCase(),
  );
  if (clash) {
    throw new Error(`Agent already exists: ${clash.name}`);
  }
  config.agents.push({
    name: agentName,
    token_env: env.token_env,
    webhook_url_env: env.webhook_url_env,
    webhook_key_env: env.webhook_key_env,
  });
  writeJsonAtomic(configPath, config);
  return { name: agentName, ...env };
}

function appendEmptyEnvNames(envPath, names, header) {
  if (!envPath || !fs.existsSync(envPath)) return { appended: false };
  const existing = fs.readFileSync(envPath, 'utf8');
  const missing = names.filter((n) => {
    const re = new RegExp(`^\\s*(?:export\\s+)?${n}=`, 'm');
    return !re.test(existing);
  });
  if (!missing.length) return { appended: false };
  const block = `\n# --- ${header} ---\n${missing.map((n) => `${n}=`).join('\n')}\n`;
  if (/=[^\s\n]/.test(block)) {
    throw new Error('Refusing to write a non-empty env value');
  }
  fs.appendFileSync(envPath, block, { encoding: 'utf8' });
  return { appended: true, names: missing };
}

function printUsage() {
  process.stderr.write(`Usage: node scripts/lib/agent-config.js <command> [options]

Commands:
  ensure-config          Copy config/agents.example.json -> config/agents.json if missing
  ensure-env             Copy .env.example -> .env if missing (empty values only)
  add --name NAME [--prefix PREFIX]
  list-names
  env-names --prefix PREFIX | --name NAME

Never pass tokens, webhook URLs, or sender keys. Only names are written.
`);
}

function main(argv = process.argv.slice(2), paths = defaultPaths()) {
  const { flags, positionals } = parseArgv(argv);
  const command = positionals[0];
  if (!command || flags.help) {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  if (flags.config) paths.config = path.resolve(String(flags.config));
  if (flags.root) {
    paths = defaultPaths(path.resolve(String(flags.root)));
    if (flags.config) paths.config = path.resolve(String(flags.config));
  }

  if (command === 'ensure-config') {
    const result = ensureConfig(paths);
    process.stdout.write(`${result.created ? 'created' : 'exists'} ${result.path}\n`);
    return result;
  }

  if (command === 'ensure-env') {
    const result = ensureEnvFile(paths);
    if (!fs.existsSync(paths.envFile)) {
      process.stdout.write('skipped (no .env.example)\n');
      return result;
    }
    process.stdout.write(`${result.created ? 'created' : 'exists'} ${result.path}\n`);
    return result;
  }

  if (command === 'list-names') {
    const names = listAgentNames(paths.config);
    process.stdout.write(names.join('\n') + (names.length ? '\n' : ''));
    return names;
  }

  if (command === 'env-names') {
    const prefix = flags.prefix ? assertPrefix(String(flags.prefix)) : prefixFromName(assertAgentName(String(flags.name || '')));
    const env = envNamesForPrefix(prefix);
    process.stdout.write(`${env.token_env}\n${env.webhook_url_env}\n${env.webhook_key_env}\n`);
    return env;
  }

  if (command === 'add') {
    if (!flags.name || flags.name === true) throw new Error('--name is required');
    const added = addAgent(paths.config, {
      name: String(flags.name),
      prefix: flags.prefix && flags.prefix !== true ? String(flags.prefix) : undefined,
    });
    const envResult = appendEmptyEnvNames(
      paths.envFile,
      [added.token_env, added.webhook_url_env, added.webhook_key_env],
      added.name,
    );
    process.stdout.write(
      `added ${added.name} ${added.token_env} ${added.webhook_url_env} ${added.webhook_key_env}`
        + (envResult.appended ? ' (env names)' : '')
        + '\n',
    );
    return added;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    die(err.message || String(err));
  }
}

module.exports = {
  SECRET_FLAGS,
  defaultPaths,
  parseArgv,
  prefixFromName,
  envNamesForPrefix,
  ensureConfig,
  ensureEnvFile,
  listAgentNames,
  addAgent,
  appendEmptyEnvNames,
  main,
};
