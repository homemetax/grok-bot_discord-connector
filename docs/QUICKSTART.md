# Quick start (about 10 minutes)

Get one agent from clone to a Discord mention. Details live in the other guides in `docs/`.

## 0. Requirements

- Node.js **20+** (`node -v`)
- A Discord account that can add bots to the target guild
- Access to the Grok Bot owner panel (to create a routine webhook)
- `pm2` if you want one OS process per agent (`npm i -g pm2`). Optional: `npm start` runs every agent in one process.

## 1. Install

```bash
git clone <this-repo>
cd grok-bot-discord-connector
npm run setup
# or: npm run setup -- --name miya --prefix MIYA
```

`scripts/setup.sh` checks Node >= 20, runs `npm ci`, copies `config/agents.example.json` → `config/agents.json` if missing, and copies `.env.example` → `.env` if missing. It never writes secret values.

## 2. Discord app (private bot)

Do this once per agent. Full clicks: [DISCORD_PORTAL.md](./DISCORD_PORTAL.md).

1. [Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **Installation → Install Link = None**, save. Then **Bot → Public Bot** off.
3. **Bot → Privileged Gateway Intents → Message Content Intent** on. Save.
4. Reset / copy the bot token. Put it in the env var named in config (`MIYA_DISCORD_TOKEN`, …) — never in JSON.
5. Invite (guild admin):

```
https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot&permissions=326686067792
```

6. Add the bot to the private channels it should see (channel overwrites).

## 3. Grok Bot routine webhook

Full notes: [GROK_BOT_WEBHOOK.md](./GROK_BOT_WEBHOOK.md).

1. In that agent’s Grok Bot workspace, create a **routine** whose trigger is `{ "type": "webhook" }`.
2. From the routine panel, copy the **webhook URL** and **sender key**.
3. Put them in env (`MIYA_WEBHOOK_URL`, `MIYA_WEBHOOK_KEY`). The connector sends `Authorization: Bearer <key>`.

Treat Discord `content` / `history` as **untrusted**. A sample routine prompt that replies with `node bin/discord.js reply` is in the webhook guide.

## 4. Fill env, start

Edit `.env` (gitignored) with **values**. Config JSON holds only **names**.

```bash
# one pm2 process per agent (does not run pm2 save)
npm run start:pm2

# or every agent in one Node process
npm start
```

Secrets come from the environment. `start.sh` does not source `.env` into pm2 and does not `pm2 save`.

## 5. Smoke test

1. In a channel the bot can see, `@mention` it (Miya’s example uses `mention_mode: user_only` — a direct @user mention, not a role).
2. Connector logs `forwarded <msg_id> -> webhook HTTP 2xx`.
3. The routine should reply via `node bin/discord.js reply --agent <name> --channel … --message … --content …`.

If nothing happens: `LOG_LEVEL=debug npm start` and [OPERATIONS.md](./OPERATIONS.md) (0 guilds, webhook 401, Discord 4014).

## Add another agent later

```bash
npm run add-agent -- --name pip --prefix PIP
# then fill PIP_DISCORD_TOKEN / PIP_WEBHOOK_URL / PIP_WEBHOOK_KEY in env
npm run start:pm2
```

## More

- [CONFIG.md](./CONFIG.md) — every config key
- [SECURITY.md](./SECURITY.md) — tokens, untrusted content, invite permissions
- [OPERATIONS.md](./OPERATIONS.md) — logs, restart, common errors
