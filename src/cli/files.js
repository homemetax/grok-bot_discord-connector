'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { asArray } = require('./parse');
const { secretEnvNames } = require('../logger');

function isDeniedAttachmentPath(resolved) {
  const normalized = resolved.replace(/\\/g, '/');
  const base = path.basename(resolved);
  if (base === '.env' || base.startsWith('.env.')) return true;
  if (/(^|\/)\.env($|\/|\.)/.test(normalized)) return true;
  if (/^(id_rsa|id_ed25519|id_ecdsa|id_dsa)$/i.test(base)) return true;
  return false;
}

function secretNameInBuffer(buf, env) {
  const text = buf.toString('utf8');
  for (const name of secretEnvNames(env)) {
    const secret = env[name];
    if (typeof secret === 'string' && secret.length >= 4 && text.includes(secret)) {
      return name;
    }
  }
  return null;
}

function loadFiles(flags, env = process.env) {
  const paths = asArray(flags.file).concat(asArray(flags.files));
  const files = [];
  for (const p of paths) {
    if (p === true || p === undefined || p === '') {
      throw new Error('--file requires a path');
    }
    const resolved = path.resolve(String(p));
    let real;
    try {
      real = fs.realpathSync(resolved);
    } catch {
      throw new Error(`Attachment not found: ${resolved}`);
    }
    if (isDeniedAttachmentPath(real) || isDeniedAttachmentPath(resolved)) {
      throw new Error('Refusing to attach a secret or environment file');
    }
    let stat;
    try {
      stat = fs.statSync(real);
    } catch {
      throw new Error(`Attachment not found: ${resolved}`);
    }
    if (!stat.isFile()) {
      throw new Error(`Attachment is not a file: ${resolved}`);
    }
    const data = fs.readFileSync(real);
    const leaked = secretNameInBuffer(data, env);
    if (leaked) {
      throw new Error('Refusing to attach a file that contains a secret environment value');
    }
    files.push({
      name: path.basename(real),
      data,
    });
  }
  return files;
}

module.exports = { loadFiles, isDeniedAttachmentPath };
