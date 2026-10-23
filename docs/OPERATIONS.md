# Operations

Hosting is a Linux box under **pm2** (typical) or **systemd**. No paid SaaS.

## Start

```bash
# recommended for teammates: one OS process per agent
npm run start:pm2

# all agents in one Node process
npm start
# or
DISCORD_AGENT=GrokBot node src/index.js
```

`scripts/start.sh` reads `config/agents.json` and runs `pm2 start src/index.js --name grok-discord-<name>` with `DISCORD_AGENT=<name>`. It does **not** run `pm2 save` (a dump would persist env). Secrets come from the environment; `src/index.js` loads a gitignored `.env` if present.

systemd units: `deploy/grok-discord.service` (all agents) and `deploy/grok-discord@.service` (one process per bot). `EnvironmentFile` points at `.env`. Do not enable services that dump the full environment on crash.

## Logs

```bash
pm2 logs
pm2 logs grok-discord-GrokBot
LOG_LEVEL=debug npm start
```

Logs go to stderr. Values of env vars whose names look like token / secret / password / authorization / webhook are replaced with `[redacted:NAME]`.

Useful debug lines:

| Line | Meaning |
| --- | --- |
| `logged in as … id=…` | Gateway ready |
| `ignore <id>: not_mentioned` | No qualifying mention (`mention_mode`) |
| `ignore <id>: not_allowlisted` | Channel not in `allowed_channel_ids` |
| `ignore <id>: dm_disabled` | DM and `enable_dms` is false |
| `ignore <id>: rate_limited` | Per-author daily cap; nothing posted to Discord |
| `ignore <id>: loop_guard_*` | Other-bot cap or cooldown |
| `forwarded <id> -> webhook HTTP 2xx` | Routine accepted the payload |
| `webhook POST failed` | Network / 4xx / 5xx from the routine |

## Restart

```bash
pm2 restart grok-discord-GrokBot
pm2 restart all
# after changing Portal intents or tokens:
pm2 restart grok-discord-GrokBot
```

Intents and tokens are read at process start. Restart after Portal or `.env` edits.

`npm run start:pm2` restarts an existing `grok-discord-<name>` with `--update-env` (still no `pm2 save`).

## Stop

```bash
pm2 stop grok-discord-GrokBot
pm2 delete grok-discord-GrokBot
```

## Common errors

### Bot is in 0 guilds

Logs show login but no `MESSAGE_CREATE`. `node bin/discord.js me --agent <name>` works.

- The invite never completed, or **Public Bot** is off and someone else tried to invite it.
- Wrong `client_id` in the invite URL (must be **this** application’s id).
- The bot was kicked.

Fix: owner invites with

`https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot&permissions=326686067792`

then confirm the bot appears in Server Settings → Members. See [DISCORD_PORTAL.md](./DISCORD_PORTAL.md).

### Webhook HTTP 401 → header

The routine rejected the sender key.

- Default header is `Authorization: Bearer <key>` ([GROK_BOT_WEBHOOK.md](./GROK_BOT_WEBHOOK.md)).
- Confirm `*_WEBHOOK_KEY` is the **sender key from the routine panel**, not the Discord token, and not wrapped in quotes with spaces.
- If you set a custom `webhook_key_header`, the raw key is sent (no `Bearer ` unless you stored it that way).
- A 401 is **not** retried.

### Discord gateway 4014 → intent

Close code **4014 Disallowed Intents** ([Gateway close event codes](https://discord.com/developers/docs/topics/opcodes-and-status-codes#gateway-gateway-close-event-codes), [privileged intents](https://discord.com/developers/docs/events/gateway#privileged-intents)):

1. Portal → **this** application (the one whose token you run) → **Bot → Privileged Gateway Intents**.
2. Enable **Message Content Intent**. Save.
3. Restart the connector.

A 4014 on reconnect loops burns [session starts](https://discord.com/developers/docs/events/gateway#session-start-limit-object). Fix the toggle before restarting in a tight loop.

### Online but ignores mentions

- `mention_mode: user_only` (GrokBot example) ignores **role** mentions. @ the bot user.
- Channel overwrite denies View Channel ([permission overwrites](https://discord.com/developers/docs/topics/permissions#permission-overwrites)).
- Non-empty `allowed_channel_ids` does not include this channel / thread parent.
- Daily limit hit (`rate_limited` at debug).
- `LOG_LEVEL=debug` to see the ignore reason.

### Login failed / REST 401

Wrong or reset Discord token. `*_DISCORD_TOKEN` must be the current Bot token. After a 401, the outbound CLI refuses further REST calls for that agent so a bad token cannot storm Discord ([rate limits](https://discord.com/developers/docs/topics/rate-limits)).

### REST 403

Discord denied the action ([permissions](https://discord.com/developers/docs/topics/permissions)). Typical: bot role too low to manage a role, or a channel overwrite denies Send Messages. The CLI prints hierarchy guidance. The connector does not invent extra permission caps.

### Webhook 429

Routine rate-limited the connector. We wait `Retry-After` / `retry_after` up to 15s and retry. Persistent 429s are a routine-side problem.

## Data on disk

| Path | What | Git |
| --- | --- | --- |
| `config/agents.json` | Agent list, env **names** | ignored |
| `.env` | Secret **values** | ignored |
| `data/author-daily.json` | Rolling 24h forward counts | ignored (`data/`) |

No other runtime database. Deleting `data/author-daily.json` resets daily caps.
