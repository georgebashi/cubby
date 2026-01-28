#!/usr/bin/env bash
set -euo pipefail

# Enable verbose mode with VERBOSE=1
if [[ "${VERBOSE:-}" == "1" ]]; then
  set -x
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
E2E_DIR="$PROJECT_ROOT/.wrangler/e2e"
PORT=8787

# Timeout configuration
TIMEOUT_SECONDS=120
OPERATION_TIMEOUT=30

# Test tokens
READ_TOKEN="test-read-token"
WRITE_TOKEN="test-write-token"
SIGNING_KEY_NAME="test-cache"

# Will be set by functions
SIGNING_KEY=""
SIGNING_KEY_PUBLIC=""
SIGNING_KEY_FILE=""
WRANGLER_PID=""
WATCHDOG_PID=""
E2E_VARS=""
ATTIC_HOME=""
NIX_PATH_A=""
NIX_PATH_B=""
WRANGLER_LOG=""
TEST_FAILED=""

# Timeout wrapper for commands
timeout_cmd() {
  local timeout=$1
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$timeout" "$@" || {
      local exit_code=$?
      if [[ $exit_code -eq 124 ]]; then
        echo "TIMEOUT: Command timed out after ${timeout}s: $*" >&2
      fi
      return $exit_code
    }
  else
    # Fallback for systems without timeout (e.g., macOS without coreutils)
    "$@"
  fi
}

fail() {
  echo "FAIL: $1" >&2
  TEST_FAILED=1
  exit 1
}

cleanup() {
  echo "Cleaning up..."

  # On failure, show wrangler log
  if [[ -n "${TEST_FAILED:-}" && -n "${WRANGLER_LOG:-}" && -f "${WRANGLER_LOG:-}" ]]; then
    echo ""
    echo "=== Last 20 lines of wrangler log ==="
    tail -20 "$WRANGLER_LOG" 2>/dev/null || true
    echo "=== End of wrangler log ==="
    echo ""
  fi

  [[ -n "${WRANGLER_PID:-}" ]] && kill "$WRANGLER_PID" 2>/dev/null || true
  [[ -n "${E2E_VARS:-}" && -f "${E2E_VARS:-}" ]] && rm -f "$E2E_VARS"
  [[ -n "${ATTIC_HOME:-}" && -d "${ATTIC_HOME:-}" ]] && rm -rf "$ATTIC_HOME"
  [[ -n "${SIGNING_KEY_FILE:-}" && -f "${SIGNING_KEY_FILE:-}" ]] && rm -f "$SIGNING_KEY_FILE"
  [[ -n "${WRANGLER_LOG:-}" && -f "${WRANGLER_LOG:-}" ]] && rm -f "$WRANGLER_LOG"
  rm -rf "$E2E_DIR"
}
# Initial trap - will be updated by start_watchdog to also kill the watchdog
trap cleanup EXIT

# Handle timeout signal from watchdog
handle_timeout() {
  echo ""
  echo "ERROR: Script timed out after ${TIMEOUT_SECONDS}s" >&2
  TEST_FAILED=1
  # cleanup will be called by EXIT trap
  exit 124
}
trap handle_timeout TERM

generate_signing_key() {
  echo "Generating signing key..."
  SIGNING_KEY=$(nix key generate-secret --key-name "$SIGNING_KEY_NAME")
  SIGNING_KEY_PUBLIC=$(echo "$SIGNING_KEY" | nix key convert-secret-to-public)

  # Write key to file (nix copy expects a file path for secret-key)
  SIGNING_KEY_FILE=$(mktemp)
  echo "$SIGNING_KEY" > "$SIGNING_KEY_FILE"

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

  # Create log file for wrangler output
  WRANGLER_LOG=$(mktemp)
  echo "Wrangler log: $WRANGLER_LOG"

  cd "$PROJECT_ROOT"
  wrangler dev \
    --port "$PORT" \
    --persist-to "$E2E_DIR" \
    --env-file "$E2E_VARS" \
    --local \
    > "$WRANGLER_LOG" 2>&1 &
  WRANGLER_PID=$!
  cd - > /dev/null
}

wait_for_server() {
  echo "Waiting for server..."
  local max_attempts=30
  for i in $(seq 1 $max_attempts); do
    if timeout_cmd 5 curl -sf -H "Authorization: Bearer $READ_TOKEN" "http://localhost:$PORT/nix-cache-info" >/dev/null 2>&1; then
      echo "Server ready (attempt $i/$max_attempts)"
      return 0
    fi
    # Check if wrangler process is still alive
    if ! kill -0 "$WRANGLER_PID" 2>/dev/null; then
      fail "Wrangler process died unexpectedly"
    fi
    sleep 0.5
  done
  fail "Server failed to start after $max_attempts attempts"
}

test_nix_copy() {
  echo "=== Test A: nix copy ==="

  # Build trivial derivation with unique content (timestamp ensures fresh path each run)
  local timestamp
  timestamp=$(date +%s%N)
  echo "Building test derivation..."
  NIX_PATH_A=$(timeout_cmd "$OPERATION_TIMEOUT" nix-build --no-out-link -E "
    with import <nixpkgs> {};
    writeText \"cubby-test-a-$timestamp\" \"hello from nix copy $timestamp\"
  ") || fail "Failed to build test derivation A"
  echo "Built: $NIX_PATH_A"

  # Push to cache (secret-key expects a file path)
  echo "Pushing via nix copy..."
  timeout_cmd "$OPERATION_TIMEOUT" nix copy --to "http://localhost:$PORT?secret-key=$SIGNING_KEY_FILE" "$NIX_PATH_A" \
    --extra-experimental-features nix-command \
    || fail "Failed to push via nix copy"

  echo "Pushed via nix copy: $NIX_PATH_A"
}

test_attic_push() {
  echo "=== Test B: attic push ==="

  # Build trivial derivation with unique content
  local timestamp
  timestamp=$(date +%s%N)
  echo "Building test derivation..."
  NIX_PATH_B=$(timeout_cmd "$OPERATION_TIMEOUT" nix-build --no-out-link -E "
    with import <nixpkgs> {};
    writeText \"cubby-test-b-$timestamp\" \"hello from attic $timestamp\"
  ") || fail "Failed to build test derivation B"
  echo "Built: $NIX_PATH_B"

  # Create isolated attic config directory
  ATTIC_HOME=$(mktemp -d)
  export XDG_CONFIG_HOME="$ATTIC_HOME"
  mkdir -p "$ATTIC_HOME/attic"

  # Register the server with attic login
  echo "Configuring attic..."
  timeout_cmd 10 attic login test "http://localhost:$PORT" "$WRITE_TOKEN" --set-default \
    || fail "Failed to configure attic"

  # Push to cache
  echo "Pushing via attic..."
  timeout_cmd "$OPERATION_TIMEOUT" attic push test:main "$NIX_PATH_B" \
    || fail "Failed to push via attic"

  echo "Pushed via attic: $NIX_PATH_B"
}

verify_cache_hits() {
  echo "=== Verifying cache hits ==="

  # Extract store path hashes
  local hash_a hash_b
  hash_a=$(basename "$NIX_PATH_A" | cut -d- -f1)
  hash_b=$(basename "$NIX_PATH_B" | cut -d- -f1)

  echo "Checking narinfo for path A ($hash_a)..."
  local narinfo_a
  narinfo_a=$(timeout_cmd 10 curl -sf -H "Authorization: Bearer $READ_TOKEN" "http://localhost:$PORT/$hash_a.narinfo") \
    || fail "Failed to fetch narinfo for path A"
  echo "$narinfo_a" | grep -q "StorePath: $NIX_PATH_A" \
    || fail "Narinfo A doesn't contain expected StorePath"

  echo "Checking narinfo for path B ($hash_b)..."
  local narinfo_b
  narinfo_b=$(timeout_cmd 10 curl -sf -H "Authorization: Bearer $READ_TOKEN" "http://localhost:$PORT/$hash_b.narinfo") \
    || fail "Failed to fetch narinfo for path B"
  echo "$narinfo_b" | grep -q "StorePath: $NIX_PATH_B" \
    || fail "Narinfo B doesn't contain expected StorePath"

  # Verify signatures are present
  echo "$narinfo_a" | grep -q "^Sig: " || fail "Narinfo A missing signature"
  echo "$narinfo_b" | grep -q "^Sig: " || fail "Narinfo B missing signature"

  echo "Both paths verified in cache with valid signatures!"
}

start_watchdog() {
  # Start a background watchdog that kills this script after TIMEOUT_SECONDS
  (
    sleep "$TIMEOUT_SECONDS"
    echo ""
    echo "ERROR: E2E test timed out after ${TIMEOUT_SECONDS}s" >&2
    # Kill the parent process group
    kill -TERM -$$ 2>/dev/null || kill -TERM $$ 2>/dev/null || true
  ) &
  WATCHDOG_PID=$!
  # Ensure watchdog is killed when we exit
  trap 'kill $WATCHDOG_PID 2>/dev/null || true; cleanup' EXIT
}

main() {
  echo "=== Cubby E2E Test ==="
  echo "Timeout: ${TIMEOUT_SECONDS}s, Operation timeout: ${OPERATION_TIMEOUT}s"
  echo ""

  # Start overall timeout watchdog
  start_watchdog

  generate_signing_key
  start_wrangler
  wait_for_server

  test_nix_copy
  test_attic_push

  verify_cache_hits

  echo ""
  echo "=== All tests passed! ==="
}

main "$@"
