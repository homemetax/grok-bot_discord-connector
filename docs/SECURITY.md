# Security

This connector is a bridge: Discord → JSON webhook → Grok Bot, and back through a REST CLI. It should never execute Discord text or persist secrets in git / pm2 dumps.

## Secrets

- **Tokens, webhook URLs, and sender keys live only in `process.env`** (typically a gitignored `.env`).
- `config/agents.json` stores **env var names**, not values.
- `scripts/setup.sh`, `scripts/add-agent.sh`, and `scripts/start.sh` **never write secret values**. They refuse `--token` / `--key` / `--webhook*` flags.
- `npm run start:pm2` does **not** run `pm2 save`, so a pm2 dump cannot persist env.
- Logs redact env values whose names look like token / secret / password / authorization / webhook.
- The outbound CLI refuses to `--file` attach `.env*`, private keys, or any file whose bytes contain a secret env value.
- Reset a leaked Discord token in the [Developer Portal](https://discord.com/developers/applications) and update env.

## Untrusted Discord content

`content`, history, attachment names, and author names are opaque strings from the [Message resource](https://discord.com/developers/docs/resources/message). The connector copies them into JSON only. It never passes them to a shell, `eval`, or dynamic `require`. Routine prompts must do the same — see [GROK_BOT_WEBHOOK.md](./GROK_BOT_WEBHOOK.md).

## Webhook POST

- `redirect: 'error'` so a 30x cannot follow the sender-key header to another host.
- 401/403 are not retried (bad key / forbidden).
- 429 waits are capped (15s).
- Default header `Authorization: Bearer <key>` matches Grok Bot routines.

## Mentions and allowlists

- Inbound: `@everyone` / `@here` never trigger the bot. `mention_mode` is `user_or_role` or `user_only`.
- Outbound: `allowed_mentions` defaults to `{ "parse": ["users"] }` (no everyone, no roles). `--allow-everyone` / `--allow-roles` are explicit.
- `allowed_channel_ids` missing/`[]` means any guild channel the bot can see (Discord overwrites are the ACL). A non-empty list is an extra filter. DMs stay off unless `enable_dms`.
- Category `parentId` is not treated as a thread parent (that would bypass a channel allowlist).

## Invite permissions

The invite integer `326686067792` includes **MANAGE_ROLES** and **MANAGE_CHANNELS** ([permissions](https://discord.com/developers/docs/topics/permissions), [hierarchy](https://discord.com/developers/docs/topics/permissions#permission-hierarchy)). A bot can only assign roles **below** its highest role and cannot grant permissions it does not have.

Risks:

- Moving the bot role to the top of the list.
- Leaving ManageRoles on a **publicly invitable** bot.

Mitigations: private bot ([DISCORD_PORTAL.md](./DISCORD_PORTAL.md) — Install Link None, then Public Bot off), dedicated bot role, deny unused permissions in channel overwrites, tokens only on the host.

## Loop guard and daily cap

- Loop guard: other bots are capped per agent + channel/thread so two bots cannot mention each other forever.
- `per_author_daily_limit`: optional rolling 24h forward cap. Hitting it is silent on Discord (`rate_limited` at debug). Exempt snowflakes skip the cap.

## CLI / prototype safety

Flag names cannot be `__proto__` / `constructor`. Snowflakes, header names (no CR/LF), emoji identifiers, and URLs are validated before REST or `fetch`.
