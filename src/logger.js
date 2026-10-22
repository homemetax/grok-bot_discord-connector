'use strict';

/**
 * Stderr logger that never prints secret values from process.env.
 * Secret-looking env vars (token/key/secret/password/authorization) are
 * replaced with [redacted:NAME] whenever they appear in a message.
 */

function secretEnvNames(env = process.env) {
  const names = [];
  for (const name of Object.keys(env)) {
    if (/token|secret|password|authorization|webhook/i.test(name)) {
      names.push(name);
    }
  }
  return names;
}

function redact(value, env = process.env) {
  let text = String(value);
  for (const name of secretEnvNames(env)) {
    const secret = env[name];
    if (typeof secret === 'string' && secret.length >= 4 && text.includes(secret)) {
      text = text.split(secret).join(`[redacted:${name}]`);
    }
  }
  return text;
}

function formatArg(arg, env) {
  if (arg instanceof Error) {
    const parts = [redact(arg.message, env)];
    if (arg.stack) parts.push(redact(arg.stack, env));
    return parts.join('\n');
  }
  if (typeof arg === 'object' && arg !== null) {
    try {
      return redact(JSON.stringify(arg), env);
    } catch {
      return redact(String(arg), env);
    }
  }
  return redact(arg, env);
}

function createLogger(agentName, env = process.env) {
  const prefix = agentName ? `[${agentName}]` : '[connector]';

  function write(level, args) {
    const ts = new Date().toISOString();
    const rendered = args.map((a) => formatArg(a, env)).join(' ');
    process.stderr.write(`${ts} ${level} ${prefix} ${rendered}\n`);
  }

  return {
    debug: (...args) => {
      if (env.LOG_LEVEL === 'debug') write('DEBUG', args);
    },
    info: (...args) => write('INFO', args),
    warn: (...args) => write('WARN', args),
    error: (...args) => write('ERROR', args),
    redact: (value) => redact(value, env),
  };
}

module.exports = { createLogger, redact, secretEnvNames };
