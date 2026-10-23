# grok-bot_discord-connector

Node.js **discord.js v14** connector that bridges Grok Bot agents to Discord.

Each agent (Miya, Scar, Jack, Devos, Pip, …) is a **separate Discord application** with its own bot token. This process receives `MESSAGE_CREATE` events, and when a message is meant for that bot it POSTs a JSON payload to that agent's Grok Bot **routine webhook**. Agents send Discord actions back through a small REST CLI in this repo.

Runs on a Linux box under **pm2** or **systemd**. No paid hosted services.

## Requirements

- Node.js 18.18+ (20 or 22 recommended)
- One Discord application per agent
- Grok Bot routine webhook URL + sender key per agent

## Setup

```bash
git clone <this-repo>
cd grok-bot_discord-connector
npm install
cp config/agents.example.json config/agents.json
cp .env.example .env
# edit config/agents.json (channel IDs) and .env (tokens, webhook URLs, keys)
node src/index.js
```

- **All agents in one process:** leave `DISCORD_AGENT` unset.
- **One process per bot:** `DISCORD_AGENT=miya node src/index.js`

Copy `config/agents.json` is gitignored so production channel IDs stay local. The committed example is `config/agents.example.json`.

## Per-agent Discord Developer Portal steps

Repeat for **each** agent (Miya, Scar, Jack, Devos, Pip, …).

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → name it after the agent.
2. **Bot**
   - Reset / copy the **token**. Store it in the env var named in config (`MIYA_DISCORD_TOKEN`, …). Never put it in JSON or git.
   - Privileged Gateway Intents: enable **Message Content Intent**.
   - Optional: disable “Public Bot” if the invite should stay private.
3. **Bot → Privileged Gateway Intents** (same page): Message Content must be on. This repo also requests (not privileged) Guilds, Guild Messages, Guild Message Reactions, Direct Messages.
4. **OAuth2 → URL Generator**
   - Scopes: `bot`
   - Permissions integer: `326686067792` (see [Invite URL](#invite-url))
   - Open the generated URL while logged into a guild admin account and authorize.
5. Channel access is controlled by Discord role permissions and overwrites. Optionally restrict further by copying channel IDs (Developer Mode → Copy Channel ID) into `allowed_channel_ids`. Omit the field or leave it `[]` to accept any guild channel or thread the bot can see.
6. Give the bot role a position **above** any roles it must manage, and grant channel overwrites it actually needs. The connector does not cap permissions; Discord will 403 when hierarchy or overwrites deny the action.

Intents used in code (`src/runtime.js`), matching [Gateway intents](https://discord.com/developers/docs/events/gateway):

| Intent | Privileged? | Why |
| --- | --- | --- |
| Guilds | no | Guild/channel/thread/role cache, `guild.members.me` |
| GuildMessages | no | `MESSAGE_CREATE` in guilds |
| GuildMessageReactions | no | Reaction events (CLI still uses REST for add/remove) |
| DirectMessages | no | DM `MESSAGE_CREATE` when `enable_dms` is true |
| MessageContent | **yes** | `content`, attachments, embeds |

Enable Message Content in the Portal for **every** application. Restart the connector after toggling intents.

## Invite URL

```
https://discord.com/oauth2/authorize?client_id=APPLICATION_ID&scope=bot&permissions=326686067792
```

Replace `APPLICATION_ID` with that agent's application id (Portal → General Information).

### How `326686067792` is computed

Discord permissions are a bitfield. Each flag is `1 << bit` (see [Permission flags](https://discord.com/developers/docs/topics/permissions)). This integer is the sum of:

| Flag | Bit | Value |
| --- | --- | --- |
| MANAGE_CHANNELS | 4 | 16 |
| ADD_REACTIONS | 6 | 64 |
| VIEW_CHANNEL | 10 | 1024 |
| SEND_MESSAGES | 11 | 2048 |
| EMBED_LINKS | 14 | 16384 |
| ATTACH_FILES | 15 | 32768 |
| READ_MESSAGE_HISTORY | 16 | 65536 |
| MANAGE_ROLES | 28 | 268435456 |
| MANAGE_THREADS | 34 | 17179869184 |
| CREATE_PUBLIC_THREADS | 35 | 34359738368 |
| SEND_MESSAGES_IN_THREADS | 38 | 274877906944 |

`16+64+1024+2048+16384+32768+65536+268435456+17179869184+34359738368+274877906944 = 326686067792`

**MANAGE_ROLES and MANAGE_CHANNELS are powerful.** Anyone who can run the outbound CLI with this token can create/edit/delete channels and roles within Discord's hierarchy rules. See [Security](#security).

## Environment variables

Secrets are read **only** from `process.env`. `.env` is gitignored. `.env.example` lists names.

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONFIG_PATH` | no | Config JSON path (default `./config/agents.json`) |
| `DISCORD_AGENT` | no | If set, run/CLI-default that agent only |
| `LOG_LEVEL=debug` | no | Verbose ignore reasons |
| `<NAME>_DISCORD_TOKEN` | yes per agent | Bot token |
| `<NAME>_WEBHOOK_URL` | yes per agent | Grok Bot routine webhook URL |
| `<NAME>_WEBHOOK_KEY` | yes per agent | Sender key (header value) |

Header **name** is config (`webhook_key_header`, default `X-Webhook-Key`), not an env var. Each agent points at env **names** for token/url/key so secrets never sit in JSON.

### `config/agents.json`

```json
{
  "webhook_key_header": "X-Webhook-Key",
  "history_limit": 20,
  "enable_dms": false,
  "webhook_timeout_ms": 30000,
  "loop_guard": {
    "max_bot_exchanges": 6,
    "window_ms": 120000,
    "cooldown_ms": 8000
  },
  "agents": [
    {
      "name": "miya",
      "token_env": "MIYA_DISCORD_TOKEN",
      "webhook_url_env": "MIYA_WEBHOOK_URL",
      "webhook_key_env": "MIYA_WEBHOOK_KEY"
    }
  ]
}
```

Per-agent overrides: `enable_dms`, `history_limit` (1–100), `webhook_key_header`, `webhook_timeout_ms`, `loop_guard`, `allowed_channel_ids`.

`allowed_channel_ids` is **optional**. Missing or `[]` means the bot responds in any guild channel or thread it can see; Discord role permissions and channel overwrites are the access control. A non-empty list is an extra filter: only those channels, plus threads (and forum posts) whose **parent** is listed. DMs stay off unless `enable_dms` is true.

## Inbound behavior

On `MESSAGE_CREATE` for that agent's client:

1. Ignore the bot's **own** messages.
2. Ignore DMs unless `enable_dms`.
3. If `allowed_channel_ids` is set and non-empty, ignore guild messages whose channel (or thread parent) is not listed. If it is missing or empty, accept any guild channel or thread the bot can see.
4. Act only if `message.mentions.users` contains this bot's user id **or** `mention_roles` contains one of this bot's roles. **@everyone / @here are not triggers** (`mention_everyone` is ignored as a mention of the bot). The @everyone role id (guild id) is not treated as a bot role.
5. Humans and other bots are both accepted. Bot-to-bot traffic is limited **per agent + channel/thread**: a sliding-window cap and a cooldown. A human message resets that chain.
6. Fetch up to `history_limit` prior messages in that channel/thread (Discord max 100).
7. POST JSON to the agent's webhook URL with the sender key in `webhook_key_header`.

Context is per channel or thread (the Discord channel id the message arrived in). Payload `channel_id` is the parent text/forum channel when the message is in a thread; `thread_id` is the thread id. When calling the CLI to reply in a thread, pass `thread_id` as `--channel`.

Discord message text is **untrusted data**. It is copied into JSON only. It is never passed to a shell, `eval`, or dynamic `require`.

## Webhook payload schema

`POST` JSON, header `<webhook_key_header>: <sender key>` (default `X-Webhook-Key`).

```json
{
  "agent": "miya",
  "guild_id": "555555555555555555",
  "channel_id": "100000000000000001",
  "thread_id": "100000000000000003",
  "msg_id": "999999999999999999",
  "author": {
    "id": "222222222222222222",
    "name": "alice",
    "is_bot": false
  },
  "content": "hello <@111111111111111111>",
  "history": [
    {
      "id": "888888888888888888",
      "author": { "id": "222222222222222222", "name": "alice", "is_bot": false },
      "content": "earlier message",
      "attachments": []
    }
  ],
  "attachments": [
    {
      "url": "https://cdn.discordapp.com/attachments/…/file.png",
      "name": "file.png",
      "type": "image/png",
      "size": 12345
    }
  ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `agent` | string | Config `name` |
| `guild_id` | string \| null | `null` in DMs |
| `channel_id` | string | Parent channel when in a thread |
| `thread_id` | string \| null | Thread/forum-post id, else `null` |
| `msg_id` | string | Triggering message |
| `author` | object | `id`, `name` (nick / global name / username), `is_bot` |
| `content` | string | Opaque untrusted text |
| `history` | array | Older messages in this channel/thread, oldest first, max 100 |
| `attachments` | array | `url`, `name`, `type`, `size` |

429s from the webhook are retried using `Retry-After` / `retry_after`. 401 and 403 are **not** retried.

## Outbound CLI

Agents (or operators) send Discord actions with the agent's token from env:

```bash
node bin/discord.js send --agent miya --channel CHANNEL_ID --content "hello"
node bin/discord.js reply --agent miya --channel CHANNEL_OR_THREAD_ID --message MSG_ID --content "…"
node bin/discord.js react --agent miya --channel ID --message ID --emoji "👍"
node bin/discord.js react --agent miya --channel ID --message ID --emoji "👍" --remove
node bin/discord.js thread --agent miya --channel ID --message ID --name "topic"
node bin/discord.js history --agent miya --channel ID --limit 50
node bin/discord.js upload --agent miya --channel ID --content "see file" --file ./shot.png
node bin/discord.js edit --agent miya --channel ID --message ID --content "corrected"
node bin/discord.js delete --agent miya --channel ID --message ID
node bin/discord.js me --agent miya

node bin/discord.js channel list --agent miya --guild GUILD_ID
node bin/discord.js channel create --agent miya --guild GUILD_ID --name notes --type 0
node bin/discord.js channel edit --agent miya --channel ID --topic "…"
node bin/discord.js channel delete --agent miya --channel ID

node bin/discord.js role list --agent miya --guild GUILD_ID
node bin/discord.js role create --agent miya --guild GUILD_ID --name mods --permissions 0
node bin/discord.js role add --agent miya --guild GUILD_ID --user USER_ID --role ROLE_ID
node bin/discord.js role remove --agent miya --guild GUILD_ID --user USER_ID --role ROLE_ID
```

- `--agent` can be omitted when `DISCORD_AGENT` is set.
- Send/reply **split at 2000 characters** (paragraph / newline / space, then a hard cut). The first reply chunk is a Discord reply; further chunks are follow-up messages in the same channel.
- `allowed_mentions` defaults to `{ "parse": ["users"] }` (**no @everyone, no roles**). `--no-mentions` sends no automatic pings. `--allow-everyone` / `--allow-roles` are explicit opt-in.
- Channel and role commands do whatever Discord allows for that bot. There is **no extra power limit** in this connector. A **403** is printed with a note about role hierarchy and channel overwrites ([permissions](https://discord.com/developers/docs/topics/permissions)).
- Rate limits: discord.js REST honors `X-RateLimit-*` and `retry_after` ([rate limits](https://discord.com/developers/docs/topics/rate-limits)). After a **401**, further REST calls for that agent are refused so a bad token cannot storm Discord. Invalid 401/403/429 storms are avoided on purpose.

Exit codes: `0` ok, `1` usage/other, `2` 401, `3` 403, `4` 429.

`node bin/discord.js --help` prints the same command list.

## Hosting

### pm2

```bash
pm2 start deploy/ecosystem.config.js
pm2 save
```

Default app `grok-discord` runs every agent in one process. To run one process per bot, copy the commented example in `deploy/ecosystem.config.js` and set `DISCORD_AGENT`.

### systemd (all agents)

```bash
sudo useradd --system --home /opt/grok-bot-discord-connector --shell /usr/sbin/nologin grokdiscord
sudo cp deploy/grok-discord.service /etc/systemd/system/
# point WorkingDirectory / EnvironmentFile at the install
sudo systemctl daemon-reload
sudo systemctl enable --now grok-discord
```

### systemd (one process per bot)

```bash
sudo cp deploy/grok-discord@.service /etc/systemd/system/
sudo systemctl enable --now grok-discord@miya grok-discord@scar
```

`EnvironmentFile` loads `.env`. Do not enable services that dump the full environment on crash.

## Security

- **Tokens, webhook URLs, and sender keys** live in the environment only. Logs redact values of env vars whose names look like tokens, secrets, passwords, or webhooks (including `*_WEBHOOK_URL`).
- **`.env` is gitignored.** Commit `.env.example` and `config/agents.example.json` only. The CLI refuses to `--file` attach `.env*` / private keys, or any file whose bytes contain a secret env value.
- **Validate inputs:** snowflakes, agent names, header names (no CR/LF), history limits, URLs, emoji identifiers. CLI rejects malformed ids before calling Discord. Flag names cannot be `__proto__` / `constructor`.
- **Untrusted content:** Discord `content` is JSON data. It is never passed to a shell, `eval`, or dynamic `require`. Do not pipe it to a shell on the Grok Bot side either.
- **Webhook POSTs do not follow redirects**, so a 30x cannot leak the sender-key header to another host. 401/403 are not retried. 429 waits are capped (15s) using `Retry-After` / `retry_after`.
- **@everyone / roles:** inbound ignores mass pings as a bot trigger; outbound blocks those mention types by default.
- **Allowlist (optional):** missing or empty `allowed_channel_ids` accepts every guild channel/thread the bot can see. A non-empty list is a filter. Category `parentId` is not treated as a thread parent. Only real threads/forum posts inherit the parent channel allowlist. DMs stay off unless `enable_dms`.
- **ManageRoles / ManageChannels:** included in the invite integer. A bot can only assign roles **below** its highest role, and cannot grant permissions it does not have. Moving the bot role to the top of the list, or leaving ManageRoles on a publicly invitable bot, is a guild-compromise risk. Prefer a dedicated bot role, deny those permissions in channel overwrites where unused, and keep tokens on the host only.
- **DMs** are off unless you set `enable_dms`.
- **Loop guard** stops two bots from bouncing mentions forever in the same thread/channel.

## Tests

```bash
npm test
```

Required coverage: mention detection, allowlist (optional/open vs filter, thread parent, DMs stay off), loop guard, message splitting. Also config selection for multi-client vs `DISCORD_AGENT`.

## Layout

```
bin/discord.js              outbound CLI
src/index.js                inbound gateway process
config/agents.example.json  committed example
deploy/                     pm2 + systemd units
test/                       node:test unit tests
```

Discord references: [Gateway](https://discord.com/developers/docs/events/gateway), [Permissions](https://discord.com/developers/docs/topics/permissions), [Rate limits](https://discord.com/developers/docs/topics/rate-limits), [Messages](https://discord.com/developers/docs/resources/message).
