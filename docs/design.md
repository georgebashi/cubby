# Cubby Design Document

A minimal, serverless Nix binary cache running on Cloudflare Workers with R2 storage.

## Overview

This is a **rebuild** (not a fork) of attic, optimized for:
- Personal CI/CD use case
- Simplicity over features
- Zero operational overhead

## Architecture

```
┌─────────────────────────────────┐
│     Cloudflare Worker (TS)      │
│  ┌───────────────────────────┐  │
│  │   All endpoints authed    │  │
│  │   (Bearer token check)    │  │
│  └───────────────────────────┘  │
└──────────────┬──────────────────┘
               │
       ┌───────▼───────┐
       │      R2       │
       │  ┌─────────┐  │
       │  │.narinfo │  │  ← metadata files
       │  │ files   │  │
       │  ├─────────┤  │
       │  │  .nar   │  │  ← NAR files
       │  │ files   │  │
       │  └─────────┘  │
       └───────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deduplication | None | Storage is cheap ($0.015/GB), complexity isn't worth it at personal scale |
| Database | None | All metadata in .narinfo files in R2 |
| Compression | Client-side only | Trust client's compression, avoid Worker CPU usage |
| GC | R2 lifecycle rules (3 days) | Zero code, automatic cleanup |
| Auth | Two bearer tokens | Read-only for hosts, read-write for CI |

## HTTP API

### Read Endpoints (standard Nix binary cache)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/nix-cache-info` | read | Cache metadata |
| `GET` | `/{hash}.narinfo` | read | Fetch narinfo |
| `HEAD` | `/{hash}.narinfo` | read | Check existence |
| `GET` | `/nar/{hash}.nar[.{compression}]` | read | Fetch NAR file |

### Attic API Endpoints (for magic-nix-cache compatibility)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/_api/v1/cache-config/{cache}` | read | Get cache config |
| `POST` | `/_api/v1/get-missing-paths` | write | Batch check missing paths |
| `PUT` | `/_api/v1/upload-path` | write | Upload store path |

### Authentication

All endpoints require `Authorization: Bearer <token>`.

- `READ_TOKEN`: Access to read endpoints only
- `WRITE_TOKEN`: Access to all endpoints (read + write)

### Response Formats

**GET /nix-cache-info:**
```
StoreDir: /nix/store
WantMassQuery: 1
Priority: 40
```

**GET /{hash}.narinfo:**
```
StorePath: /nix/store/abc123...-openssl-3.0.0
URL: nar/xyz789.nar.zst
Compression: zstd
FileHash: sha256:xyz789...
FileSize: 1234567
NarHash: sha256:def456...
NarSize: 2345678
References: abc123...-openssl-3.0.0 def456...-glibc-2.35
Sig: cache-1:base64signature...
```

**GET /_api/v1/cache-config/{cache}:**
```json
{
  "substituter_endpoint": "https://nix-cache.example.workers.dev",
  "api_endpoint": "https://nix-cache.example.workers.dev",
  "public_key": "cache-1:base64pubkey...",
  "is_public": false,
  "priority": 40,
  "store_dir": "/nix/store"
}
```

**POST /_api/v1/get-missing-paths:**

Request:
```json
{
  "cache": "main",
  "store_path_hashes": ["abc123...", "def456..."]
}
```

Response:
```json
{
  "missing_paths": ["abc123..."]
}
```

**PUT /_api/v1/upload-path:**

NAR info sent via header or body preamble:
```json
{
  "cache": "main",
  "store_path_hash": "abc123...",
  "store_path": "/nix/store/abc123...-foo",
  "references": ["/nix/store/def456...-bar"],
  "nar_hash": "sha256:...",
  "nar_size": 12345,
  "sigs": ["cache-1:base64..."],
  "system": "x86_64-linux",
  "deriver": "...",
  "ca": null
}
```

Two ways to send:
1. `X-Attic-Nar-Info` header (JSON, for payloads <4KB)
2. Body preamble with `X-Attic-Nar-Info-Preamble-Size` header (for larger payloads)

Response:
```json
{
  "kind": "Uploaded",
  "file_size": 12345
}
```

## Upload Flow

```
1. Client PUTs to /_api/v1/upload-path
   - Header: Authorization: Bearer <write-token>
   - Header: X-Attic-Nar-Info: {"cache":"main","store_path_hash":"abc123",...}
   - Body: compressed NAR data

2. Worker parses nar_info from header or body preamble

3. Worker streams NAR body directly to R2:
   - Key: nar/{nar_hash}.nar.{compression}
   - (We trust client's hash - no server-side validation)

4. Worker generates narinfo and stores to R2:
   - Key: {store_path_hash}.narinfo
   - Content: standard narinfo format with server signature

5. Worker returns UploadPathResult:
   {"kind": "Uploaded", "file_size": 12345}
```

## R2 Storage Layout

```
bucket/
├── {store_path_hash}.narinfo    # metadata (text)
└── nar/
    └── {nar_hash}.nar.{comp}    # NAR data (binary)
```

R2 lifecycle rule: Delete objects after 3 days.

## Implementation

### Tech Stack

- **Runtime:** Cloudflare Workers (TypeScript)
- **Framework:** Hono
- **Storage:** R2
- **Signing:** tweetnacl (Ed25519)

### Project Structure

```
nix-cache-worker/
├── src/
│   ├── index.ts          # Worker entrypoint, routing
│   ├── auth.ts           # Bearer token validation
│   ├── narinfo.ts        # Narinfo parsing/generation
│   ├── signing.ts        # Ed25519 signing
│   └── handlers/
│       ├── cache-info.ts       # GET /nix-cache-info
│       ├── narinfo.ts          # GET/HEAD /{hash}.narinfo
│       ├── nar.ts              # GET /nar/{hash}.nar
│       ├── cache-config.ts     # GET /_api/v1/cache-config/{cache}
│       ├── get-missing.ts      # POST /_api/v1/get-missing-paths
│       └── upload.ts           # PUT /_api/v1/upload-path
├── wrangler.toml         # Workers config
└── package.json
```

### Configuration

**wrangler.toml:**
```toml
name = "nix-cache"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "nix-cache"

[vars]
CACHE_NAME = "main"
CACHE_PRIORITY = "40"
```

**Secrets (via `wrangler secret put`):**
- `READ_TOKEN` - Bearer token for read-only access
- `WRITE_TOKEN` - Bearer token for read+write access
- `SIGNING_KEY` - Ed25519 private key (base64)
- `SIGNING_KEY_NAME` - Key name for signatures (e.g., "cache-1")

### Auth Logic

```typescript
function checkAuth(request: Request, env: Env, requireWrite: boolean): boolean {
  const auth = request.headers.get("Authorization");
  const token = auth?.replace("Bearer ", "");

  if (token === env.WRITE_TOKEN) return true;
  if (!requireWrite && token === env.READ_TOKEN) return true;
  return false;
}
```

## Usage with magic-nix-cache-action

```yaml
- uses: DeterminateSystems/nix-installer-action@main
- uses: DeterminateSystems/magic-nix-cache-action@main
  with:
    use-flakehub: false
    use-gha-cache: false
    upstream-cache: https://nix-cache.example.workers.dev
  env:
    # Configure attic client
    ATTIC_SERVER: https://nix-cache.example.workers.dev
    ATTIC_TOKEN: ${{ secrets.NIX_CACHE_WRITE_TOKEN }}
```

Note: Exact integration may require additional configuration - needs testing.

## Estimated Effort

~300-400 lines of TypeScript. Implementation should take 1-2 days.
