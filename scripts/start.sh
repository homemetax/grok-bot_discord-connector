#!/usr/bin/env bash
# Start one pm2 process per agent listed in config/agents.json.
# Does not run `pm2 save`. Secrets come from the environment (src/index.js
# loads gitignored .env). This script never writes secret values.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LIB="$ROOT/scripts/lib/agent-config.js"
DRY_RUN=0
CONFIG=""

usage() {
  cat <<'EOF'
Usage: scripts/start.sh [--dry-run] [--config PATH]

  Starts one pm2 process per agent in config/agents.json
  (name: grok-discord-<agent>, DISCORD_AGENT=<agent>).

  Secrets come from the environment. src/index.js loads a gitignored .env
  if present. This script does not source .env, does not pass tokens to
  pm2, and does not run `pm2 save` so a pm2 dump cannot persist secrets.

  Restart later with: pm2 restart grok-discord-<name>
  Logs:              pm2 logs grok-discord-<name>
  See docs/OPERATIONS.md.

Options:
  --dry-run       Print commands only
  --config PATH   agents.json (default: config/agents.json)
  --help          Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1; shift ;;
    --config)
      CONFIG="${2:-}"; shift 2 ;;
    --help|-h)
      usage; exit 0 ;;
    --token|--secret|--key|--webhook|--webhook-url|--webhook-key|--discord-token|--sender-key)
      echo "Refusing $1: start never writes or accepts secret values." >&2
      exit 1 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1 ;;
  esac
done

if [ -n "$CONFIG" ]; then
  CONFIG="$(cd "$(dirname "$CONFIG")" && pwd)/$(basename "$CONFIG")"
else
  CONFIG="$ROOT/config/agents.json"
fi

if [ ! -f "$CONFIG" ]; then
  echo "Config not found: $CONFIG" >&2
  echo "Run npm run setup first (copies config/agents.example.json)." >&2
  exit 1
fi

mapfile -t NAMES < <(node "$LIB" --root "$ROOT" --config "$CONFIG" list-names)
if [ "${#NAMES[@]}" -eq 0 ] || [ -z "${NAMES[0]:-}" ]; then
  echo "No agents listed in $CONFIG" >&2
  exit 1
fi

echo "Secrets come from the environment (typically a gitignored .env loaded by src/index.js)."
echo "This script does not write tokens or keys, and it will not run pm2 save."

if [ "$DRY_RUN" -eq 0 ] && ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is not installed. Install it (npm i -g pm2) or use --dry-run." >&2
  echo "Or run all agents in one process: npm start" >&2
  exit 1
fi

for name in "${NAMES[@]}"; do
  proc="grok-discord-${name}"
  # Only DISCORD_AGENT is set here. Tokens stay in the process environment /
  # .env that Node loads — they are never written to a pm2 dump by this script.
  cmd=(env DISCORD_AGENT="$name" CONFIG_PATH="$CONFIG" pm2 start src/index.js
    --name "$proc"
    --cwd "$ROOT"
    --interpreter node
    --max-memory-restart 300M
    --kill-timeout 8000)
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+ DISCORD_AGENT=%s CONFIG_PATH=%s pm2 start src/index.js --name %s --cwd %s --interpreter node\n' \
      "$name" "$CONFIG" "$proc" "$ROOT"
    continue
  fi
  if pm2 describe "$proc" >/dev/null 2>&1; then
    echo "restart $proc (DISCORD_AGENT=$name)"
    env DISCORD_AGENT="$name" CONFIG_PATH="$CONFIG" pm2 restart "$proc" --update-env
  else
    echo "start $proc (DISCORD_AGENT=$name)"
    "${cmd[@]}"
  fi
done

echo "Started ${#NAMES[@]} agent process(es). Not running pm2 save."
echo "Logs: pm2 logs   Status: pm2 ls   Docs: docs/OPERATIONS.md"
