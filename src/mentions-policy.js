'use strict';

const { DEFAULT_ALLOWED_MENTIONS } = require('./constants');

/**
 * Default allowed_mentions blocks @everyone and role pings.
 * User mentions remain allowed unless --no-mentions is set.
 */
function buildAllowedMentions(flags = {}) {
  if (flags['no-mentions'] || flags.noMentions) {
    return { parse: [], replied_user: false };
  }

  const parse = [];
  const allowEveryone = Boolean(flags['allow-everyone'] || flags.allowEveryone);
  const allowRoles = Boolean(flags['allow-roles'] || flags.allowRoles);
  const allowUsers = flags['allow-users'] === false || flags.allowUsers === false
    ? false
    : true;

  if (allowEveryone) parse.push('everyone');
  if (allowRoles) parse.push('roles');
  if (allowUsers) parse.push('users');

  const body = { parse };
  if (flags['mention-replied-user'] === false || flags.repliedUser === false) {
    body.replied_user = false;
  } else if (flags['mention-replied-user'] || flags.repliedUser) {
    body.replied_user = true;
  }

  if (typeof flags['mention-users'] === 'string' && flags['mention-users'].length) {
    body.users = flags['mention-users'].split(',').map((s) => s.trim()).filter(Boolean);
    body.parse = parse.filter((p) => p !== 'users');
  }
  if (typeof flags['mention-roles'] === 'string' && flags['mention-roles'].length) {
    body.roles = flags['mention-roles'].split(',').map((s) => s.trim()).filter(Boolean);
    body.parse = parse.filter((p) => p !== 'roles');
  }

  if (!body.parse.length && !body.users && !body.roles) {
    return { parse: [], replied_user: body.replied_user || false };
  }
  return body;
}

function defaultAllowedMentions() {
  return { parse: DEFAULT_ALLOWED_MENTIONS.parse.slice() };
}

module.exports = { buildAllowedMentions, defaultAllowedMentions };
