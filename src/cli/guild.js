'use strict';

const { Routes } = require('../rest');
const { assertSnowflake, assertNonEmptyString } = require('../validate');
const { flagString, flagBool } = require('./parse');

function optionalInt(flags, key) {
  if (flags[key] === undefined || flags[key] === true) return undefined;
  const n = Number.parseInt(String(flags[key]), 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid --${key}`);
  return n;
}

function optionalString(flags, key) {
  if (flags[key] === undefined || flags[key] === true) return undefined;
  return String(flags[key]);
}

async function cmdChannel(session, sub, flags) {
  switch (sub) {
    case 'list': {
      const guildId = assertSnowflake(flagString(flags, 'guild', 'guild-id'), 'guild id');
      return session.call('get', Routes.guildChannels(guildId));
    }
    case 'get': {
      const channelId = assertSnowflake(flagString(flags, 'channel', 'channel-id'), 'channel id');
      return session.call('get', Routes.channel(channelId));
    }
    case 'create': {
      const guildId = assertSnowflake(flagString(flags, 'guild', 'guild-id'), 'guild id');
      const name = assertNonEmptyString(flagString(flags, 'name'), 'channel name');
      const body = { name };
      const type = optionalInt(flags, 'type');
      if (type !== undefined) body.type = type;
      const parent = flagString(flags, 'parent', 'parent-id');
      if (parent) body.parent_id = assertSnowflake(parent, 'parent id');
      const topic = optionalString(flags, 'topic');
      if (topic !== undefined) body.topic = topic;
      if (flags.nsfw !== undefined) body.nsfw = flagBool(flags, 'nsfw');
      return session.call('post', Routes.guildChannels(guildId), { body });
    }
    case 'edit': {
      const channelId = assertSnowflake(flagString(flags, 'channel', 'channel-id'), 'channel id');
      const body = {};
      const name = optionalString(flags, 'name');
      if (name !== undefined) body.name = name;
      const topic = optionalString(flags, 'topic');
      if (topic !== undefined) body.topic = topic;
      const parent = flagString(flags, 'parent', 'parent-id');
      if (parent) body.parent_id = assertSnowflake(parent, 'parent id');
      if (flags.nsfw !== undefined) body.nsfw = flagBool(flags, 'nsfw');
      if (!Object.keys(body).length) throw new Error('channel edit requires at least one field');
      return session.call('patch', Routes.channel(channelId), { body });
    }
    case 'delete': {
      const channelId = assertSnowflake(flagString(flags, 'channel', 'channel-id'), 'channel id');
      return session.call('delete', Routes.channel(channelId));
    }
    default:
      throw new Error(`Unknown channel subcommand "${sub || ''}". Use list|get|create|edit|delete`);
  }
}

async function cmdRole(session, sub, flags) {
  switch (sub) {
    case 'list': {
      const guildId = assertSnowflake(flagString(flags, 'guild', 'guild-id'), 'guild id');
      return session.call('get', Routes.guildRoles(guildId));
    }
    case 'get': {
      const guildId = assertSnowflake(flagString(flags, 'guild', 'guild-id'), 'guild id');
      const roles = await session.call('get', Routes.guildRoles(guildId));
      const roleId = assertSnowflake(flagString(flags, 'role', 'role-id'), 'role id');
      const role = (roles || []).find((r) => r.id === roleId);
      if (!role) throw new Error(`Role ${roleId} not found in guild ${guildId}`);
      return role;
    }
    case 'create': {
      const guildId = assertSnowflake(flagString(flags, 'guild', 'guild-id'), 'guild id');
      const name = assertNonEmptyString(flagString(flags, 'name'), 'role name');
      const body = { name };
      const permissions = optionalString(flags, 'permissions');
      if (permissions !== undefined) body.permissions = permissions;
      const color = optionalString(flags, 'color');
      if (color !== undefined) {
        body.color = color.startsWith('#') ? Number.parseInt(color.slice(1), 16) : Number.parseInt(color, 10);
      }
      if (flags.hoist !== undefined) body.hoist = flagBool(flags, 'hoist');
      if (flags.mentionable !== undefined) body.mentionable = flagBool(flags, 'mentionable');
      return session.call('post', Routes.guildRoles(guildId), { body });
    }
    case 'edit': {
      const guildId = assertSnowflake(flagString(flags, 'guild', 'guild-id'), 'guild id');
      const roleId = assertSnowflake(flagString(flags, 'role', 'role-id'), 'role id');
      const body = {};
      const name = optionalString(flags, 'name');
      if (name !== undefined) body.name = name;
      const permissions = optionalString(flags, 'permissions');
      if (permissions !== undefined) body.permissions = permissions;
      const color = optionalString(flags, 'color');
      if (color !== undefined) {
        body.color = color.startsWith('#') ? Number.parseInt(color.slice(1), 16) : Number.parseInt(color, 10);
      }
      if (flags.hoist !== undefined) body.hoist = flagBool(flags, 'hoist');
      if (flags.mentionable !== undefined) body.mentionable = flagBool(flags, 'mentionable');
      if (!Object.keys(body).length) throw new Error('role edit requires at least one field');
      return session.call('patch', Routes.guildRole(guildId, roleId), { body });
    }
    case 'delete': {
      const guildId = assertSnowflake(flagString(flags, 'guild', 'guild-id'), 'guild id');
      const roleId = assertSnowflake(flagString(flags, 'role', 'role-id'), 'role id');
      await session.call('delete', Routes.guildRole(guildId, roleId));
      return { deleted: true, guild_id: guildId, role_id: roleId };
    }
    case 'add': {
      const guildId = assertSnowflake(flagString(flags, 'guild', 'guild-id'), 'guild id');
      const userId = assertSnowflake(flagString(flags, 'user', 'user-id', 'member'), 'user id');
      const roleId = assertSnowflake(flagString(flags, 'role', 'role-id'), 'role id');
      await session.call('put', Routes.guildMemberRole(guildId, userId, roleId));
      return { added: true, guild_id: guildId, user_id: userId, role_id: roleId };
    }
    case 'remove': {
      const guildId = assertSnowflake(flagString(flags, 'guild', 'guild-id'), 'guild id');
      const userId = assertSnowflake(flagString(flags, 'user', 'user-id', 'member'), 'user id');
      const roleId = assertSnowflake(flagString(flags, 'role', 'role-id'), 'role id');
      await session.call('delete', Routes.guildMemberRole(guildId, userId, roleId));
      return { removed: true, guild_id: guildId, user_id: userId, role_id: roleId };
    }
    default:
      throw new Error(`Unknown role subcommand "${sub || ''}". Use list|get|create|edit|delete|add|remove`);
  }
}

module.exports = { cmdChannel, cmdRole };
