#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
E2E_DIR="$PROJECT_ROOT/.wrangler/e2e"
PORT=8787

# Test tokens
READ_TOKEN="test-read-token"
WRITE_TOKEN="test-write-token"
SIGNING_KEY_NAME="test-cache"

# Will be set by functions
SIGNING_KEY=""
SIGNING_KEY_PUBLIC=""
WRANGLER_PID=""
E2E_VARS=""
ATTIC_CONFIG=""
NIX_PATH_A=""
NIX_PATH_B=""

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

cleanup() {
  echo "Cleaning up..."
  [[ -n "${WRANGLER_PID:-}" ]] && kill "$WRANGLER_PID" 2>/dev/null || true
  [[ -n "${E2E_VARS:-}" && -f "${E2E_VARS:-}" ]] && rm -f "$E2E_VARS"
  [[ -n "${ATTIC_CONFIG:-}" && -f "${ATTIC_CONFIG:-}" ]] && rm -f "$ATTIC_CONFIG"
  rm -rf "$E2E_DIR"
}
trap cleanup EXIT

generate_signing_key() {
  echo "Generating signing key..."
  SIGNING_KEY=$(nix key generate-secret --key-name "$SIGNING_KEY_NAME")
  SIGNING_KEY_PUBLIC=$(echo "$SIGNING_KEY" | nix key convert-secret-to-public)
  echo "Public key: $SIGNING_KEY_PUBLIC"
}

start_wrangler() {
  echo "Starting wrangler dev..."

  # Create temp secrets file
  E2E_VARS=$(mktemp)
  cat > "$E2E_VARS" <<EOF
READ_TOKEN=$READ_TOKEN
WRITE_TOKEN=$WRITE_TOKEN
SIGNING_KEY=$SIGNING_KEY
SIGNING_KEY_NAME=$SIGNING_KEY_NAME
EOF

  cd "$PROJECT_ROOT"
  wrangler dev \
    --port "$PORT" \
    --persist-to "$E2E_DIR" \
    --env-file "$E2E_VARS" \
    --local \
    > /dev/null 2>&1 &
  WRANGLER_PID=$!
  cd - > /dev/null
}

wait_for_server() {
  echo "Waiting for server..."
  for i in {1..30}; do
    if curl -sf -H "Authorization: Bearer $READ_TOKEN" "http://localhost:$PORT/nix-cache-info" >/dev/null 2>&1; then
      echo "Server ready"
      return 0
    fi
    sleep 0.5
  done
  fail "Server failed to start"
}

test_nix_copy() {
  echo "=== Test A: nix copy ==="

  # Build trivial derivation
  NIX_PATH_A=$(nix-build --no-out-link -E '
    with import <nixpkgs> {};
    writeText "cubby-test-a" "hello from nix copy"
  ')
  echo "Built: $NIX_PATH_A"

  # Push to cache
  echo "Pushing via nix copy..."
  nix copy --to "http://localhost:$PORT?secret-key=$SIGNING_KEY&write-nar-listing=1" "$NIX_PATH_A" \
    --extra-experimental-features nix-command

  echo "Pushed via nix copy: $NIX_PATH_A"
}

test_attic_push() {
  echo "=== Test B: attic push ==="

  # Build trivial derivation
  NIX_PATH_B=$(nix-build --no-out-link -E '
    with import <nixpkgs> {};
    writeText "cubby-test-b" "hello from attic"
  ')
  echo "Built: $NIX_PATH_B"

  # Configure attic with temp config
  ATTIC_CONFIG=$(mktemp)
  cat > "$ATTIC_CONFIG" <<EOF
default-server = "test"

[servers.test]
endpoint = "http://localhost:$PORT"
token = "$WRITE_TOKEN"
EOF
  export ATTIC_CONFIG

  # Push to cache
  echo "Pushing via attic..."
  attic push test:main "$NIX_PATH_B"

  echo "Pushed via attic: $NIX_PATH_B"
}

verify_cache_hits() {
  echo "=== Verifying cache hits ==="

  # Delete both paths from local store
  echo "Deleting local store paths..."
  nix store delete "$NIX_PATH_A" "$NIX_PATH_B" --ignore-liveness 2>/dev/null || true

  # Verify they're gone
  [[ ! -e "$NIX_PATH_A" ]] || fail "Path A still exists locally"
  [[ ! -e "$NIX_PATH_B" ]] || fail "Path B still exists locally"

  # Fetch from cache using nix copy
  echo "Fetching from cache..."
  nix copy --from "http://localhost:$PORT?trusted=1" \
    --extra-experimental-features nix-command \
    "$NIX_PATH_A" "$NIX_PATH_B"

  # Verify contents
  echo "Verifying contents..."
  [[ "$(cat "$NIX_PATH_A")" == "hello from nix copy" ]] || fail "Path A content mismatch"
  [[ "$(cat "$NIX_PATH_B")" == "hello from attic" ]] || fail "Path B content mismatch"

  echo "Both paths fetched and verified!"
}

main() {
  echo "=== Cubby E2E Test ==="

  generate_signing_key
  start_wrangler
  wait_for_server

  test_nix_copy
  test_attic_push

  verify_cache_hits

  echo "=== All tests passed! ==="
}

main "$@"
