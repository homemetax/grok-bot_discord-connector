# Documentation maintenance

Update docs in the same change that alters behavior. Do not leave README, examples, or this map stale.

## Sources of truth

| Topic | Update these |
| --- | --- |
| Agent config schema, env var names, header name | `README.md`, `docs/CONFIG.md`, `config/agents.example.json`, `.env.example`, `PROJECT_CONTEXT.md`, `src/config.js` |
| Inbound mention / allowlist / loop-guard / daily-limit rules | `README.md`, `docs/CONFIG.md`, `PROJECT_CONTEXT.md`, unit tests under `test/` |
| Persisted data dir | `README.md`, `docs/CONFIG.md`, `.env.example`, `.gitignore`, `src/author-daily.js` |
| Webhook JSON payload | `README.md` (schema section), `docs/GROK_BOT_WEBHOOK.md`, `src/payload.js` |
| Outbound CLI commands and flags | `README.md`, `docs/GROK_BOT_WEBHOOK.md`, `src/cli/index.js` help text |
| Invite permissions integer | `README.md`, `docs/DISCORD_PORTAL.md`, `src/constants.js` |
| Hosting (pm2 / systemd) | `README.md`, `docs/OPERATIONS.md`, `docs/QUICKSTART.md`, `deploy/*`, `scripts/start.sh` |
| Security (secrets, 403 hierarchy, untrusted content) | `README.md`, `docs/SECURITY.md` |
| Teammate packaging scripts | `docs/QUICKSTART.md`, `scripts/setup.sh`, `scripts/add-agent.sh`, `scripts/start.sh`, `package.json` |

## Do not treat as product docs

- GitHub PR bodies and review comments
- Temporary hand-off notes
- `node_modules/`

## Tests that lock the docs

`npm test` must stay green when behavior described in README changes. The required suites are:

- `test/mentions.test.js`
- `test/allowlist.test.js`
- `test/loop-guard.test.js`
- `test/author-daily.test.js` (cap, exempt, 24h window, persist/reload, atomic write)
- `test/split.test.js`
- `test/security.test.js` (redirects, secret files, prototype flags, thread vs category)
- `test/packaging.test.js` (setup/add-agent write env names only; start.sh dry-run; no pm2 save)

Add or edit those tests when the corresponding rule changes.
