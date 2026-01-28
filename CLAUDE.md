# Cubby - AI Context

Minimal Nix binary cache on Cloudflare Workers + R2. Implements Attic-compatible API for use with magic-nix-cache-action in GitHub Actions.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono (lightweight web framework)
- **Storage**: Cloudflare R2 (S3-compatible)
- **Signing**: tweetnacl (Ed25519 signatures)
- **Language**: TypeScript

## Project Structure

```
src/
  index.ts          # Main worker entry, Hono app setup
  routes/           # API route handlers
  signing.ts        # Ed25519 signing with tweetnacl
  auth.ts           # Token authentication middleware
wrangler.toml       # Cloudflare Workers config, R2 bindings
```

## Key Files

- `src/index.ts` - Hono app, route registration, R2 bucket binding
- `src/signing.ts` - NAR signing logic using tweetnacl Ed25519
- `src/auth.ts` - Middleware checking READ_TOKEN/WRITE_TOKEN
- `wrangler.toml` - R2 bucket binding (`CACHE`), worker config

## API Endpoints

- `GET /cache-info` - Cache metadata
- `GET /:hash.narinfo` - Fetch narinfo
- `GET /nar/:hash` - Fetch NAR file
- `PUT /:hash.narinfo` - Upload narinfo (write auth)
- `PUT /nar/:hash` - Upload NAR (write auth)

## Development

```bash
# Install dependencies
npm install

# Run locally
wrangler dev

# Deploy
wrangler deploy

# Set secrets
wrangler secret put READ_TOKEN
wrangler secret put WRITE_TOKEN
wrangler secret put SIGNING_KEY
```

## Testing

```bash
npm test
```

## Implementation Notes

1. **Attic compatibility** - Implements Attic API subset for magic-nix-cache integration. Not a full Nix binary cache protocol implementation.

2. **No NAR validation** - Server trusts client-provided hashes. No server-side validation of NAR contents or hash correctness.

3. **Signing on upload** - SIGNING_KEY secret (Ed25519 private key) signs narinfo on upload. Uses tweetnacl for Ed25519 operations.

4. **Two-token auth**:
   - `READ_TOKEN` - Read-only access (GET requests)
   - `WRITE_TOKEN` - Read-write access (GET + PUT requests)

5. **No deduplication** - Each store path stored independently. Relies on R2 lifecycle rules for cleanup (default: 3 days expiry).

6. **R2 binding** - Bucket bound as `CACHE` in wrangler.toml. Access via `env.CACHE` in handlers.
