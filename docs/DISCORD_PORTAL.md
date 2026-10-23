# Discord Developer Portal (one app per agent)

Each Grok Bot agent is a **separate Discord application** with its own bot token. Repeat this page for Miya, Scar, Jack, Devos, Pip, and any new agent.

Portal: [https://discord.com/developers/applications](https://discord.com/developers/applications)

Background: [Gateway](https://discord.com/developers/docs/events/gateway), [Privileged intents](https://discord.com/developers/docs/events/gateway#privileged-intents), [OAuth2](https://discord.com/developers/docs/topics/oauth2), [Permissions](https://discord.com/developers/docs/topics/permissions).

## 1. Create the application

1. Open the [Developer Portal](https://discord.com/developers/applications) while logged into the account that should **own** the bot.
2. **New Application** → name it after the agent → accept the terms → **Create**.
3. On **General Information**, copy the **Application ID**. That is `APP_ID` / `client_id` in the invite URL.

## 2. Make the bot private (Install Link, then Public Bot)

Discord will refuse **Public Bot = off** while a default install link exists.

1. Left nav → **Installation**.
2. Set **Install Link** to **None**. Save changes.
3. Left nav → **Bot**.
4. Untick **Public Bot**. Save.

Only the application owner (and team members) can add a private bot to guilds. Leave **Requires OAuth2 Code Grant** off or the invite fails with “Integration requires code grant”.

If Discord errors with “Cannot have install fields on a private application” / “Private application cannot have a default authorization link”, go back to **Installation**, set **Install Link = None**, save, then untick **Public Bot** again.

## 3. Bot token

Still on **Bot**:

1. **Reset Token** → copy it once.
2. Store it in the env var named in `config/agents.json` (`MIYA_DISCORD_TOKEN`, …).
3. Never put the token in JSON, git, chat, or a pm2 dump.

A leaked token is a full bot login. Reset it in the Portal and update env.

## 4. Message Content Intent

This connector requests [Message Content](https://discord.com/developers/docs/events/gateway#message-content-intent) so `content`, attachments, and embeds are present on `MESSAGE_CREATE`.

On **Bot → Privileged Gateway Intents**:

- Enable **Message Content Intent**.
- Leave **Presence** and **Server Members** off unless you change the code to request them.

Save. Restart the connector after toggling intents. If the Portal toggle is off while the process requests the intent, Discord closes the gateway with **4014 Disallowed Intents** ([close codes](https://discord.com/developers/docs/topics/opcodes-and-status-codes#gateway-gateway-close-event-codes)).

Intents used in `src/runtime.js` ([Gateway intents](https://discord.com/developers/docs/events/gateway)):

| Intent | Privileged? | Why |
| --- | --- | --- |
| Guilds | no | Guild/channel/thread/role cache, `guild.members.me` |
| GuildMessages | no | `MESSAGE_CREATE` in guilds |
| GuildMessageReactions | no | Reaction cache (CLI still uses REST) |
| DirectMessages | no | DM `MESSAGE_CREATE` when `enable_dms` is true |
| Message Content | **yes** | `content`, attachments, embeds |

## 5. Invite URL

Do **not** use the Portal’s default install link (it is **None** on purpose). Use a constructed bot-only URL ([OAuth2 bot authorization](https://discord.com/developers/docs/topics/oauth2#bot-authorization-flow)):

```
https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot&permissions=326686067792
```

Replace `APP_ID` with that application’s id. Open it while logged into a **guild admin** account and authorize.

`scope=bot` only. This connector is a gateway bot, not a user-installable app.

### Permission integer `326686067792`

Discord permissions are a bitfield ([permission flags](https://discord.com/developers/docs/topics/permissions)). This integer is the sum of:

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

**MANAGE_ROLES and MANAGE_CHANNELS are powerful.** Anyone who can run `node bin/discord.js` with this token can create/edit/delete channels and roles within Discord’s [hierarchy rules](https://discord.com/developers/docs/topics/permissions#permission-hierarchy). See [SECURITY.md](./SECURITY.md).

## 6. Add the bot to private channels

After the invite, the bot’s role must be able to see and speak in the channels you care about ([permission overwrites](https://discord.com/developers/docs/topics/permissions#permission-overwrites)):

1. Server Settings → **Roles**: put the bot role **above** any roles it must manage.
2. For each private channel: **Edit channel → Permissions** → add the bot (or its role) with View Channel, Send Messages, Read Message History, Embed Links, Attach Files, Add Reactions. For threads, also Send Messages in Threads.
3. Optional extra filter in config: `allowed_channel_ids` (see [CONFIG.md](./CONFIG.md)). Missing/`[]` means any guild channel the bot can already see.

A bot that cannot **View Channel** never receives `MESSAGE_CREATE` for that channel. That looks like “the bot is online but ignores me”.

## 7. Confirm

- Portal **Bot** page shows the application online after `npm start` / `npm run start:pm2`.
- In Discord: right-click the bot → **Copy User ID** if you need it for allowlists / mention debugging.
- `node bin/discord.js me --agent <name>` prints the user object (token from env).
