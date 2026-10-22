'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { asArray } = require('./parse');

function loadFiles(flags) {
  const paths = asArray(flags.file).concat(asArray(flags.files));
  const files = [];
  for (const p of paths) {
    if (p === true || p === undefined || p === '') {
      throw new Error('--file requires a path');
    }
    const resolved = path.resolve(String(p));
    let stat;
    try {
      stat = fs.statSync(resolved);
    } catch {
      throw new Error(`Attachment not found: ${resolved}`);
    }
    if (!stat.isFile()) {
      throw new Error(`Attachment is not a file: ${resolved}`);
    }
    files.push({
      name: path.basename(resolved),
      data: fs.readFileSync(resolved),
    });
  }
  return files;
}

module.exports = { loadFiles };
