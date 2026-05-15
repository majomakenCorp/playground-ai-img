#!/usr/bin/env bash
# Smoke-test the Claude Code CLI from inside the `app` container.
# Run: ./scripts/check-claude.sh
# Exits non-zero on any failure. Designed for milestone C-01 of the
# Claude-provider SDD.

set -euo pipefail

SERVICE="app"
CONTAINER="playground-app"

if ! docker compose ps --services --filter "status=running" | grep -qx "${SERVICE}"; then
  echo "✗ ${SERVICE} container is not running. Bring it up with: docker compose up -d"
  exit 1
fi

echo "→ Resolving host bindings inside the container…"
docker compose exec -T "${SERVICE}" sh -c '
  set -e
  test -x "${CLAUDE_CLI_PATH:-/usr/local/bin/claude}" || {
    echo "✗ CLI not executable at ${CLAUDE_CLI_PATH:-/usr/local/bin/claude}"
    exit 1
  }
  test -d "/home/app/.claude" || {
    echo "✗ ~/.claude is not mounted at /home/app/.claude"
    exit 1
  }
  echo "  ✓ CLI present, credentials directory mounted"
'

echo "→ Checking CLI version (proves the binary actually executes)…"
docker compose exec -T "${SERVICE}" "${CLAUDE_CLI_PATH:-/usr/local/bin/claude}" --version

echo "→ Running a tools-disabled ping ('reply with the word ok')…"
# Stdin used deliberately — never put user-controlled text on the argv.
RESPONSE=$(docker compose exec -T "${SERVICE}" sh -c '
  printf "Reply with the single word ok." \
    | "${CLAUDE_CLI_PATH:-/usr/local/bin/claude}" -p \
        --output-format json \
        --disallowedTools "*"
')

echo "${RESPONSE}" | head -c 400
echo

if ! echo "${RESPONSE}" | grep -qi '"result"'; then
  echo "✗ Unexpected response shape — expected a JSON object with a 'result' field"
  exit 1
fi

echo "✓ Claude CLI is reachable from ${CONTAINER}."
