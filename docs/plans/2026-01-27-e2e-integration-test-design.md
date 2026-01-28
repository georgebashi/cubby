# E2E Integration Test Design

## Overview

End-to-end test that validates the full round-trip: build → push → clear local store → pull from cache. Tests both the standard Nix binary cache protocol (`nix copy`) and the Attic API (`attic push`).

## Components

| Component | Description |
|-----------|-------------|
| `flake.nix` | DevShell with node, wrangler, attic |
| `tests/e2e/run.sh` | Main test script |
| Test A | nix copy → standard binary cache protocol |
| Test B | attic push → Attic API endpoints |
| Verification | Delete local paths, fetch from cache, verify content |

## Test Flow

```
1. Generate test signing keypair (nix key generate-secret)
2. Start wrangler dev with local R2 (--persist-to .wrangler/e2e)
3. Wait for server to be ready (poll /nix-cache-info)

4. Test A (nix copy):
   - Build trivial derivation (writeText "cubby-test-a")
   - Push with: nix copy --to "http://localhost:8787?secret-key=..."
   - Record the store path

5. Test B (attic client):
   - Configure attic to point at localhost:8787
   - Build trivial derivation (writeText "cubby-test-b")
   - Push with: attic push test:main /nix/store/...
   - Record the store path

6. Delete both paths from local store (nix store delete --ignore-liveness)
7. Fetch both paths from cache (nix copy --from)
8. Verify contents match expected strings
9. Cleanup: stop wrangler, remove temp files, remove local R2 data
```

## Flake

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    attic.url = "github:zhaofengli/attic";
  };

  outputs = { self, nixpkgs, attic }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f system);
    in {
      devShells = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_22
              pkgs.nodePackages.wrangler
              attic.packages.${system}.default
            ];
          };
        }
      );
    };
}
```

## Test Script Structure

```bash
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

cleanup() {
  echo "Cleaning up..."
  [[ -n "${WRANGLER_PID:-}" ]] && kill "$WRANGLER_PID" 2>/dev/null || true
  [[ -n "${E2E_VARS:-}" ]] && rm -f "$E2E_VARS"
  rm -rf "$E2E_DIR"
}
trap cleanup EXIT

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
```

## Wrangler Dev Setup

```bash
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

  wrangler dev \
    --port "$PORT" \
    --persist-to "$E2E_DIR" \
    --var-file "$E2E_VARS" \
    --local \
    &
  WRANGLER_PID=$!
}

wait_for_server() {
  echo "Waiting for server..."
  for i in {1..30}; do
    if curl -sf "http://localhost:$PORT/nix-cache-info" >/dev/null 2>&1; then
      echo "Server ready"
      return 0
    fi
    sleep 0.5
  done
  echo "Server failed to start"
  exit 1
}
```

## Test Derivations

Trivial derivations using `writeText`:

```bash
# For nix copy test
NIX_PATH_A=$(nix-build --no-out-link -E '
  with import <nixpkgs> {};
  writeText "cubby-test-a" "hello from nix copy"
')

# For attic test
NIX_PATH_B=$(nix-build --no-out-link -E '
  with import <nixpkgs> {};
  writeText "cubby-test-b" "hello from attic"
')
```

## Attic Client Configuration

```bash
test_attic_push() {
  echo "=== Test B: attic push ==="

  NIX_PATH_B=$(nix-build --no-out-link -E '
    with import <nixpkgs> {};
    writeText "cubby-test-b" "hello from attic"
  ')

  export ATTIC_CONFIG=$(mktemp)
  cat > "$ATTIC_CONFIG" <<EOF
default-server = "test"

[servers.test]
endpoint = "http://localhost:$PORT"
token = "$WRITE_TOKEN"
EOF

  attic push test:main "$NIX_PATH_B"
  rm -f "$ATTIC_CONFIG"
}
```

## Verification

```bash
verify_cache_hits() {
  echo "=== Verifying cache hits ==="

  # Delete from local store
  nix store delete "$NIX_PATH_A" "$NIX_PATH_B" --ignore-liveness

  # Verify gone
  [[ ! -e "$NIX_PATH_A" ]] || fail "Path A still exists"
  [[ ! -e "$NIX_PATH_B" ]] || fail "Path B still exists"

  # Fetch from cache
  nix copy --from "http://localhost:$PORT?trusted=1" \
    --extra-experimental-features nix-command \
    "$NIX_PATH_A" "$NIX_PATH_B"

  # Verify contents
  [[ "$(cat "$NIX_PATH_A")" == "hello from nix copy" ]] || fail "Path A mismatch"
  [[ "$(cat "$NIX_PATH_B")" == "hello from attic" ]] || fail "Path B mismatch"
}
```

## Usage

```bash
# From nix devShell
nix develop
npm run test:e2e

# Or directly
nix develop --command ./tests/e2e/run.sh
```

## CI Integration

```yaml
- uses: DeterminateSystems/nix-installer-action@main
- uses: DeterminateSystems/magic-nix-cache-action@main
- run: nix develop --command npm run test:e2e
```
