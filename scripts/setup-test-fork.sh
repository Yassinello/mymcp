#!/bin/sh
# scripts/setup-test-fork.sh
#
# Set up a GitHub fork at a known commit offset for live update-check
# integration testing (Phase 62 STAB-03 / Phase 63 CRON-02).
#
# Usage:
#   ./scripts/setup-test-fork.sh <github-username> <token-with-repo-scope>
#
# Creates (idempotent) a fork at <username>/kebab-mcp-test-fixture and
# resets it to a commit ~5 commits behind upstream/main, so live tests
# see status="behind", behind_by≈5.
#
# Set the resulting GITHUB_TEST_TOKEN + GITHUB_TEST_FORK_OWNER env vars
# in your local .env (NOT committed) before running:
#   npx vitest run tests/integration/config-update-github-live.test.ts

set -e

USER="${1:-}"
TOKEN="${2:-}"

if [ -z "$USER" ] || [ -z "$TOKEN" ]; then
  echo "Usage: $0 <github-username> <token-with-repo-scope>"
  exit 1
fi

UPSTREAM="Yassinello/kebab-mcp"
FORK="$USER/kebab-mcp-test-fixture"
API="https://api.github.com"

# 1. Fork (no-op if already exists)
echo "Forking $UPSTREAM → $FORK ..."
curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  "$API/repos/$UPSTREAM/forks" \
  -d "{\"name\":\"kebab-mcp-test-fixture\",\"default_branch_only\":true}" \
  >/dev/null || echo "  (fork already exists or API limited)"

# 2. Wait for fork to be ready
sleep 5

# 3. Get the SHA 5 commits back on upstream/main
SHA=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "$API/repos/$UPSTREAM/commits?sha=main&per_page=6" \
  | grep -m 6 '"sha"' | tail -1 | sed -E 's/.*"sha": "([^"]+)".*/\1/')

if [ -z "$SHA" ]; then
  echo "Failed to resolve target SHA"
  exit 1
fi

echo "Target SHA (5 commits back): $SHA"

# 4. Reset fork's main to that SHA via the Git Refs API
echo "Resetting $FORK main to $SHA ..."
curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" \
  "$API/repos/$FORK/git/refs/heads/main" \
  -d "{\"sha\":\"$SHA\",\"force\":true}" \
  >/dev/null

echo ""
echo "Done. Configure your test env:"
echo "  export GITHUB_TEST_TOKEN=$TOKEN"
echo "  export GITHUB_TEST_FORK_OWNER=$USER"
echo ""
echo "Then run:"
echo "  npx vitest run tests/integration/config-update-github-live.test.ts"
