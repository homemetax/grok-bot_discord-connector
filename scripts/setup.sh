#!/usr/bin/env bash
# Teammate setup: check Node, install deps, create local config, optionally add an agent.
# Never writes secret values (tokens, webhook URLs, sender keys).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LIB="$ROOT/scripts/lib/agent-config.js"
SKIP_NPM=0
NONINTERACTIVE=0
NAME=""
PREFIX=""

usage() {
  cat <<'EOF'
Usage: scripts/setup.sh [--name NAME] [--prefix PREFIX] [--yes] [--skip-npm]

  Checks Node.js >= 20, runs npm ci, copies config/agents.example.json to
  config/agents.json if that file is missing, and copies .env.example to .env
  (empty values only) if .env is missing.

  Optionally adds one agent entry (interactive, or --name / --prefix).
  --prefix defaults to the uppercased agent name (hyphens -> underscores).

  This script never writes secret values. Put tokens and keys in the
  environment (typically the gitignored .env). See docs/QUICKSTART.md.

Options:
  --name NAME     Agent name (1-64 letters, digits, _ or -)
  --prefix PREFIX Env var prefix, e.g. GROKBOT -> GROKBOT_DISCORD_TOKEN
  --yes           Do not prompt
  --skip-npm      Skip npm ci (tests / already installed)
  --help          Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --name)
      NAME="${2:-}"; shift 2 ;;
    --prefix)
      PREFIX="${2:-}"; shift 2 ;;
    --yes|--non-interactive)
      NONINTERACTIVE=1; shift ;;
    --skip-npm)
      SKIP_NPM=1; shift ;;
    --help|-h)
      usage; exit 0 ;;
    --token|--secret|--key|--webhook|--webhook-url|--webhook-key|--discord-token|--sender-key)
      echo "Refusing $1: setup never writes secret values. Set them in the environment." >&2
      exit 1 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1 ;;
  esac
done

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js >= 20 is required (node not found)." >&2
    exit 1
  fi
  local ver major
  ver="$(node -p "process.versions.node")"
  major="${ver%%.*}"
  if [ "${major:-0}" -lt 20 ]; then
    echo "Node.js >= 20 is required (found $ver)." >&2
    exit 1
  fi
  echo "Node.js $ver"
}

require_node

if [ "$SKIP_NPM" -eq 0 ]; then
  if [ ! -f package-lock.json ]; then
    echo "package-lock.json is missing; cannot run npm ci." >&2
    exit 1
  fi
  npm ci
fi

node "$LIB" --root "$ROOT" ensure-config
node "$LIB" --root "$ROOT" ensure-env

add_agent() {
  local args=(--root "$ROOT" add --name "$1")
  if [ -n "${2:-}" ]; then
    args+=(--prefix "$2")
  fi
  node "$LIB" "${args[@]}"
  echo "Set these in the environment (empty placeholders may have been added to .env):"
  if [ -n "${2:-}" ]; then
    node "$LIB" --root "$ROOT" env-names --prefix "$2"
  else
    node "$LIB" --root "$ROOT" env-names --name "$1"
  fi
}

if [ -n "$NAME" ]; then
  add_agent "$NAME" "$PREFIX"
elif [ "$NONINTERACTIVE" -eq 0 ] && [ -t 0 ]; then
  printf 'Add a new agent to config/agents.json? [y/N] '
  read -r ans || true
  case "${ans:-}" in
    y|Y|yes|YES)
      printf 'Agent name: '
      read -r NAME
      printf 'Env var prefix (blank = derived from name): '
      read -r PREFIX
      if [ -z "$NAME" ]; then
        echo "Agent name is required." >&2
        exit 1
      fi
      add_agent "$NAME" "$PREFIX"
      ;;
    *)
      echo "Skipping add-agent. Run npm run add-agent later."
      ;;
  esac
fi

cat <<EOF
Setup complete.

Next:
  1. Fill token / webhook URL / sender key in the environment (see .env). Never commit them.
  2. docs/DISCORD_PORTAL.md — create a private Discord app per agent
  3. docs/GROK_BOT_WEBHOOK.md — create each agent's routine webhook
  4. npm run start:pm2    # one pm2 process per agent (does not pm2 save)
     or: npm start        # all agents in one process

Secrets come from the environment. These scripts do not write them to disk.
EOF
