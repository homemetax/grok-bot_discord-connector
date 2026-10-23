#!/usr/bin/env bash
# Add one agent entry to config/agents.json (env *names* only).
# Never writes secret values.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LIB="$ROOT/scripts/lib/agent-config.js"

NAME=""
PREFIX=""

usage() {
  cat <<'EOF'
Usage: scripts/add-agent.sh --name NAME [--prefix PREFIX]

  Adds an agent to config/agents.json:
    token_env        PREFIX_DISCORD_TOKEN
    webhook_url_env  PREFIX_WEBHOOK_URL
    webhook_key_env  PREFIX_WEBHOOK_KEY

  --prefix defaults to the uppercased name (hyphens become underscores).
  If config/agents.json is missing, it is created from the example first.
  Empty NAME= placeholders are appended to .env when that file exists.

  This script never writes secret values. Put the token, webhook URL, and
  sender key in the environment after it runs.

Options:
  --name NAME     Required. 1-64 letters, digits, _ or -
  --prefix PREFIX Env var prefix (e.g. GROKBOT)
  --help          Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --name)
      NAME="${2:-}"; shift 2 ;;
    --prefix)
      PREFIX="${2:-}"; shift 2 ;;
    --help|-h)
      usage; exit 0 ;;
    --token|--secret|--key|--webhook|--webhook-url|--webhook-key|--discord-token|--sender-key)
      echo "Refusing $1: add-agent never writes secret values. Set them in the environment." >&2
      exit 1 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1 ;;
  esac
done

if [ -z "$NAME" ] && [ -t 0 ]; then
  printf 'Agent name: '
  read -r NAME
  printf 'Env var prefix (blank = derived from name): '
  read -r PREFIX
fi

if [ -z "$NAME" ]; then
  echo "--name is required." >&2
  usage >&2
  exit 1
fi

node "$LIB" --root "$ROOT" ensure-config
node "$LIB" --root "$ROOT" ensure-env

args=(--root "$ROOT" add --name "$NAME")
if [ -n "$PREFIX" ]; then
  args+=(--prefix "$PREFIX")
fi
node "$LIB" "${args[@]}"

echo "Set these in the environment (do not commit values):"
if [ -n "$PREFIX" ]; then
  node "$LIB" --root "$ROOT" env-names --prefix "$PREFIX"
else
  node "$LIB" --root "$ROOT" env-names --name "$NAME"
fi
