# Documentation maintenance

Update docs in the same change that alters behavior. Do not leave README, examples, or this map stale.

## Sources of truth

| Topic | Update these |
| --- | --- |
| Agent config schema, env var names, header name | `README.md`, `config/agents.example.json`, `.env.example`, `PROJECT_CONTEXT.md`, `src/config.js` |
| Inbound mention / allowlist / loop-guard rules | `README.md`, `PROJECT_CONTEXT.md`, unit tests under `test/` |
| Webhook JSON payload | `README.md` (schema section), `src/payload.js` |
| Outbound CLI commands and flags | `README.md`, `src/cli/index.js` help text |
| Invite permissions integer | `README.md`, `src/constants.js` |
| Hosting (pm2 / systemd) | `README.md`, `deploy/*` |
| Security (secrets, 403 hierarchy, untrusted content) | `README.md` |

## Do not treat as product docs

- GitHub PR bodies and review comments
- Temporary hand-off notes
- `node_modules/`

## Tests that lock the docs

`npm test` must stay green when behavior described in README changes. The required suites are:

- `test/mentions.test.js`
- `test/allowlist.test.js`
- `test/loop-guard.test.js`
- `test/split.test.js`
- `test/security.test.js` (redirects, secret files, prototype flags, thread vs category)

Add or edit those tests when the corresponding rule changes.
