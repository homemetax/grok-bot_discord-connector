'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  parseArgv,
  prefixFromName,
  envNamesForPrefix,
  ensureConfig,
  ensureEnvFile,
  addAgent,
  listAgentNames,
  appendEmptyEnvNames,
} = require('../scripts/lib/agent-config');

const REPO = path.join(__dirname, '..');

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'packaging-'));
  fs.mkdirSync(path.join(root, 'config'));
  fs.copyFileSync(
    path.join(REPO, 'config', 'agents.example.json'),
    path.join(root, 'config', 'agents.example.json'),
  );
  fs.copyFileSync(path.join(REPO, '.env.example'), path.join(root, '.env.example'));
  return root;
}

function sh(script, args, extra = {}) {
  const cwd = extra.cwd || REPO;
  const scriptPath = extra.cwd
    ? path.join(extra.cwd, 'scripts', script)
    : path.join(REPO, 'scripts', script);
  return spawnSync('bash', [scriptPath, ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, ...(extra.env || {}) },
  });
}

describe('agent-config helpers', () => {
  it('derives PREFIX from the agent name', () => {
    assert.equal(prefixFromName('miya'), 'MIYA');
    assert.equal(prefixFromName('my-bot'), 'MY_BOT');
    assert.deepEqual(envNamesForPrefix('PIP'), {
      token_env: 'PIP_DISCORD_TOKEN',
      webhook_url_env: 'PIP_WEBHOOK_URL',
      webhook_key_env: 'PIP_WEBHOOK_KEY',
    });
  });

  it('refuses flags that would write secret values', () => {
    assert.throws(
      () => parseArgv(['add', '--name', 'x', '--token', 'secret-value']),
      /never write secret values/,
    );
    assert.throws(
      () => parseArgv(['add', '--webhook-key', 'abc']),
      /never write secret values/,
    );
  });

  it('creates agents.json from the example and adds an agent with env names only', () => {
    const root = tmpRoot();
    const config = path.join(root, 'config', 'agents.json');
    const example = path.join(root, 'config', 'agents.example.json');
    const envFile = path.join(root, '.env');
    const envExample = path.join(root, '.env.example');

    const ensured = ensureConfig({ config, example });
    assert.equal(ensured.created, true);
    assert.ok(fs.existsSync(config));

    const envCreated = ensureEnvFile({ envFile, envExample });
    assert.equal(envCreated.created, true);

    const added = addAgent(config, { name: 'nova', prefix: 'NOVA' });
    assert.equal(added.token_env, 'NOVA_DISCORD_TOKEN');
    assert.ok(listAgentNames(config).includes('nova'));

    const raw = fs.readFileSync(config, 'utf8');
    assert.match(raw, /NOVA_DISCORD_TOKEN/);
    assert.doesNotMatch(raw, /sk-|Bot |Bearer /);
    const parsed = JSON.parse(raw);
    const nova = parsed.agents.find((a) => a.name === 'nova');
    assert.deepEqual(nova, {
      name: 'nova',
      token_env: 'NOVA_DISCORD_TOKEN',
      webhook_url_env: 'NOVA_WEBHOOK_URL',
      webhook_key_env: 'NOVA_WEBHOOK_KEY',
    });

    const appended = appendEmptyEnvNames(
      envFile,
      [added.token_env, added.webhook_url_env, added.webhook_key_env],
      'nova',
    );
    assert.equal(appended.appended, true);
    const envText = fs.readFileSync(envFile, 'utf8');
    assert.match(envText, /^NOVA_DISCORD_TOKEN=$/m);
    assert.match(envText, /^NOVA_WEBHOOK_URL=$/m);
    assert.match(envText, /^NOVA_WEBHOOK_KEY=$/m);
    assert.doesNotMatch(envText, /NOVA_DISCORD_TOKEN=./);
  });

  it('rejects a duplicate agent name', () => {
    const root = tmpRoot();
    const config = path.join(root, 'config', 'agents.json');
    fs.copyFileSync(path.join(root, 'config', 'agents.example.json'), config);
    assert.throws(() => addAgent(config, { name: 'miya', prefix: 'MIYA' }), /already exists/);
  });
});

describe('packaging scripts', () => {
  it('setup.sh --skip-npm copies config and can add an agent without writing secrets', () => {
    const root = tmpRoot();
    fs.copyFileSync(path.join(REPO, 'package.json'), path.join(root, 'package.json'));
    fs.cpSync(path.join(REPO, 'scripts'), path.join(root, 'scripts'), { recursive: true });
    fs.cpSync(path.join(REPO, 'src'), path.join(root, 'src'), { recursive: true });

    const result = sh('setup.sh', ['--skip-npm', '--yes', '--name', 'nova', '--prefix', 'NOVA'], { cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /NOVA_DISCORD_TOKEN/);
    assert.doesNotMatch(result.stdout + result.stderr, /sk-|Bot [A-Za-z0-9._-]{10,}/);

    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config', 'agents.json'), 'utf8'));
    assert.ok(cfg.agents.some((a) => a.name === 'nova' && a.token_env === 'NOVA_DISCORD_TOKEN'));
    const envText = fs.readFileSync(path.join(root, '.env'), 'utf8');
    assert.match(envText, /^NOVA_DISCORD_TOKEN=$/m);
  });

  it('add-agent.sh refuses secret flags', () => {
    const result = sh('add-agent.sh', ['--name', 'x', '--token', 'nope']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /never writes secret values/);
  });

  it('start.sh --dry-run prints one pm2 process per agent and never pm2 save', () => {
    const root = tmpRoot();
    fs.copyFileSync(
      path.join(root, 'config', 'agents.example.json'),
      path.join(root, 'config', 'agents.json'),
    );
    const result = sh(
      'start.sh',
      ['--dry-run', '--config', path.join(root, 'config', 'agents.json')],
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /grok-discord-miya/);
    assert.match(result.stdout, /DISCORD_AGENT=miya/);
    assert.match(result.stdout, /grok-discord-scar/);
    assert.match(result.stdout, /Secrets come from the environment/);
    assert.match(result.stdout, /not running pm2 save|will not run pm2 save/i);
    assert.doesNotMatch(result.stdout, /^\+ .*pm2 save/m);
    assert.doesNotMatch(result.stdout + result.stderr, /MIYA_DISCORD_TOKEN=/);
  });
});
