# Project context

`grok-bot_discord-connector` is a Node.js (discord.js v14) bridge between Grok Bot agents and Discord.

## Model

- One Discord **application + bot token** per agent (Miya, Scar, Jack, Devos, Pip, …).
- `config/agents.json` lists agents: `name`, token env var, webhook URL env var, webhook key env var, optional `allowed_channel_ids`, `mention_mode`, `per_author_daily_limit`, `rate_limit_exempt_author_ids`. Root `data_dir` (or `DATA_DIR`) holds persisted counts.
- Secrets live only in `process.env` (typically a `.env` file loaded into the environment). They are never committed or logged.
- Hosting is a Linux box under **pm2** or **systemd**. No paid SaaS is required. Teammate packaging: `scripts/setup.sh`, `scripts/add-agent.sh`, `scripts/start.sh` (one pm2 process per agent, no `pm2 save`). Scripts never write secret values.
- **Multi-client in one process** is the default (`node src/index.js` logs in every configured agent). **One process per bot** is `DISCORD_AGENT=<name>`.

## Data flow

```
Discord MESSAGE_CREATE
  → mention (mention_mode) + allowlist + loop-guard + per-author daily limit
  → JSON payload
  → POST agent Grok Bot routine webhook (sender key header)
  → agent later calls `node bin/discord.js …` with that agent's token
  → Discord REST (send / reply / react / thread / history / …)
```

Inbound never executes Discord message text. Outbound never invents permission caps; Discord 403s are shown as-is.

## Key modules

| Path | Role |
| --- | --- |
| `src/index.js` | Process entry: load env/config, start 1..N clients |
| `src/config.js` | Validate config; `selectAgents` for multi vs single |
| `src/mentions.js` | User/role mention detection (`mention_mode`); ignore @everyone/@here |
| `src/allowlist.js` | Optional channel allowlist + thread parent + DM flag |
| `src/loop-guard.js` | Bot-to-bot cap + cooldown per agent+channel/thread |
| `src/author-daily.js` | Rolling 24h per-author forward cap; atomic JSON persist |
| `src/inbound.js` | Pure gate used by the handler and tests |
| `src/handler.js` | discord.js `messageCreate` → webhook POST |
| `src/payload.js` | Webhook JSON builder (untrusted strings) |
| `src/webhook.js` | fetch POST with 429 retry, no 401/403 retry |
| `src/split.js` | 2000-character message splitting |
| `src/cli/` | Outbound REST CLI |
| `bin/discord.js` | CLI entry |
| `scripts/` | Teammate setup / add-agent / pm2 start (env names only) |
| `docs/` | QUICKSTART, DISCORD_PORTAL, GROK_BOT_WEBHOOK, CONFIG, OPERATIONS, SECURITY |

## Invariants

1. Act only when this bot is mentioned: default `user_or_role` is a user mention of the bot or one of its (non-@everyone) roles; `user_only` requires a direct @user mention.
2. Ignore DMs unless the agent has `enable_dms: true`.
3. Never handle the bot's own messages.
4. Humans always pass the loop guard (and reset the bot-to-bot chain). Other bots are capped per thread/channel with a cooldown.
5. `allowed_mentions` defaults to user pings only (no everyone, no roles).
6. History fetch uses Discord's max of 100.
7. Invite permission integer is `326686067792` (documented in README). Connector code does not further restrict ManageRoles/ManageChannels.
8. Webhook fetch uses `redirect: 'error'` so the sender key cannot follow a 30x.
9. Threads are detected via `channel.isThread()` / thread types, never via “has parentId” (that would treat category children as threads).
10. `allowed_channel_ids` missing or empty means any visible guild channel/thread; a non-empty list is an optional filter. DMs stay off unless `enable_dms`.
11. Default webhook sender header is `Authorization` with `Bearer <key>` unless the key already starts with `Bearer `.
12. `per_author_daily_limit` 0 (default) is off. A positive cap counts forwards per author per agent over a rolling 24h window. Exempt author ids skip the cap. Hitting the cap logs `rate_limited` at debug and does not POST or reply on Discord. Counts persist atomically under `DATA_DIR` / `data_dir` (default `./data`).

## Docs to keep in sync

See `documentation-maintenance.md`. Primary user-facing doc is `README.md`, with teammate guides under `docs/`.
