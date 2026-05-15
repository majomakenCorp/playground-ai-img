#!/usr/bin/env bash
# Mock for /usr/bin/claude used by tests/providers/claude-cli.test.ts.
# Behavior steered by env vars set in the test:
#   CLAUDE_MOCK_MODE=ok           → return a valid envelope with a result string
#   CLAUDE_MOCK_MODE=broken_json  → stdout is not valid JSON at all
#   CLAUDE_MOCK_MODE=error_env    → envelope with is_error=true
#   CLAUDE_MOCK_MODE=no_result    → envelope missing the result field
#   CLAUDE_MOCK_MODE=auth_fail    → exit 1 with a credentials-flavored stderr
#   CLAUDE_MOCK_MODE=sleep        → sleep forever so the parent can test timeout
#   CLAUDE_MOCK_MODE=flood        → spew >256 KiB to trigger the size guard
# Stdin is read and discarded — real CLI would consume it.

set -e
cat >/dev/null   # drain stdin so the parent's write doesn't EPIPE

case "${CLAUDE_MOCK_MODE:-ok}" in
  ok)
    cat <<'JSON'
{"result":"A minimal geometric leaf glyph in sage green on cream, flat vector, centered composition, modern wellness brand.","is_error":false}
JSON
    ;;
  broken_json)
    echo "not valid json at all {"
    ;;
  error_env)
    cat <<'JSON'
{"result":"","is_error":true,"subtype":"model_refused"}
JSON
    ;;
  no_result)
    cat <<'JSON'
{"is_error":false}
JSON
    ;;
  auth_fail)
    echo "Error: not logged in — please run \`claude login\`" >&2
    exit 1
    ;;
  sleep)
    sleep 240
    ;;
  flood)
    # Emit ~320 KiB of zeros — must exceed MAX_OUTPUT_BYTES=256 KiB.
    head -c 327680 </dev/zero | tr '\0' 'x'
    ;;
  *)
    echo "unknown CLAUDE_MOCK_MODE: ${CLAUDE_MOCK_MODE}" >&2
    exit 2
    ;;
esac
