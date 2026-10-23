# Config reference

Primary file: `config/agents.json` (gitignored). Committed template: `config/agents.example.json`.

Override the path with `CONFIG_PATH`. Secrets are **never** in this file — only env var **names**. See [SECURITY.md](./SECURITY.md).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONFIG_PATH` | no | Config JSON path (default `./config/agents.json`) |
| `DISCORD_AGENT` | no | If set, this process / CLI default is that agent only |
| `DATA_DIR` | no | Persist dir (default `./data`, gitignored). Overrides `data_dir`. |
| `LOG_LEVEL=debug` | no | Verbose ignore reasons (`not_mentioned`, `rate_limited`, …) |
| `<PREFIX>_DISCORD_TOKEN` | yes per agent | Bot token |
| `<PREFIX>_WEBHOOK_URL` | yes per agent | Grok Bot routine webhook URL |
| `<PREFIX>_WEBHOOK_KEY` | yes per agent | Sender key (header value) |

Header **name** is config (`webhook_key_header`), not an env var.

## Root keys

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `webhook_key_header` | string | `Authorization` | Header that carries the sender key. `Authorization` → `Bearer <key>` unless the key already starts with `Bearer `. |
| `history_limit` | int | `20` | Prior messages to fetch (1–100; Discord max 100). |
| `enable_dms` | bool | `false` | When true, DMs that mention the bot are forwarded. |
| `webhook_timeout_ms` | int | `30000` | Webhook POST timeout (1000–120000). |
| `loop_guard` | object | see below | Bot-to-bot cap / cooldown (inherited by agents). |
| `mention_mode` | string | `user_or_role` | Default mention rule for agents that omit it. |
| `per_author_daily_limit` | int | `0` | Default daily forward cap (`0` = off). |
| `rate_limit_exempt_author_ids` | string[] | `[]` | Default exempt author snowflakes. |
| `data_dir` | string | `./data` | Directory for `author-daily.json`. |
| `agents` | object[] | — | Required, at least one. |

## Per-agent keys

Every agent needs `name`, `token_env`, `webhook_url_env`, `webhook_key_env`. Other keys override the root defaults.

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `name` | string | — | 1–64 letters, digits, `_`, `-`. Unique (case-insensitive). |
| `token_env` | string | — | Env var **name** for the bot token. |
| `webhook_url_env` | string | — | Env var **name** for the routine URL. |
| `webhook_key_env` | string | — | Env var **name** for the sender key. |
| `allowed_channel_ids` | string[] | omitted / `[]` | **Optional.** Missing or `[]` = any guild channel/thread the bot can see. Non-empty = only those channel ids, plus threads/forum posts whose **parent** is listed. Category `parentId` is not a thread parent. DMs still require `enable_dms`. |
| `mention_mode` | string | `user_or_role` | `user_or_role`: @user mention of the bot **or** a mention of one of its roles. `user_only`: only a direct @user mention; role mentions are ignored. `@everyone` / `@here` never count. |
| `per_author_daily_limit` | int | `0` | Forwards per author per agent on a rolling 24h window. `0` = off. |
| `rate_limit_exempt_author_ids` | string[] | `[]` | Author snowflakes that skip the daily cap and are not counted. |
| `enable_dms` | bool | root | Forward DMs. |
| `history_limit` | int | root | 1–100. |
| `webhook_key_header` | string | root | Per-agent header override. |
| `webhook_timeout_ms` | int | root | Per-agent timeout. |
| `loop_guard` | object | root | Merged over root `loop_guard`. |

### `loop_guard`

Stops two bots from bouncing mentions in the same channel/thread. Humans always pass and reset the chain.

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `max_bot_exchanges` | int | `6` | Accepted other-bot messages in `window_ms`. |
| `window_ms` | int | `120000` | Sliding window. |
| `cooldown_ms` | int | `8000` | Minimum gap between accepted other-bot messages. |

Own messages are dropped before the loop guard.

### Daily author limit

When `per_author_daily_limit` > 0, each successful inbound **decision to forward** increments that author on that agent. Window is rolling 24 hours. On cap: no webhook POST, no Discord reply, log `rate_limited` at debug. Counts persist atomically as `<data_dir>/author-daily.json` (gitignored).

Example (GrokBot in `config/agents.example.json`):

```json
{
  "name": "GrokBot",
  "token_env": "GROKBOT_DISCORD_TOKEN",
  "webhook_url_env": "GROKBOT_WEBHOOK_URL",
  "webhook_key_env": "GROKBOT_WEBHOOK_KEY",
  "per_author_daily_limit": 1,
  "rate_limit_exempt_author_ids": ["200000000000000001"],
  "mention_mode": "user_only"
}
```

## Adding an agent

```bash
npm run add-agent -- --name agent-1 --prefix AGENT_1
```

Writes env **names** only. Then set `AGENT_1_DISCORD_TOKEN`, `AGENT_1_WEBHOOK_URL`, `AGENT_1_WEBHOOK_KEY` in the environment.

## Multi-client vs one process per bot

- `DISCORD_AGENT` unset → `node src/index.js` logs in every agent (one process).
- `DISCORD_AGENT=GrokBot` → that agent only.
- `npm run start:pm2` starts **one pm2 process per agent** from the config (does not `pm2 save`).
