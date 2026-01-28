# Cubby

A minimal Nix binary cache running on Cloudflare Workers with R2 storage. Designed for personal CI/CD use cases where simplicity matters more than advanced features.

## Why Cubby?

Most Nix binary cache solutions are either expensive hosted services or complex self-hosted setups. Cubby takes a different approach: a single Cloudflare Worker with R2 storage. No servers to manage, no databases to maintain, and costs are minimal for personal use.

## Features

- **Serverless** - Runs on Cloudflare Workers with zero infrastructure to manage
- **Cheap storage** - Uses R2 (S3-compatible) with no egress fees
- **Attic-compatible API** - Works with `magic-nix-cache-action` out of the box
- **Simple auth** - Two tokens: read-only and read-write
- **No database** - Store info files directly in R2
- **Automatic cleanup** - R2 lifecycle rules expire old paths (default: 3 days)

## Quick Start

### Prerequisites

- Cloudflare account with Workers and R2 enabled
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed

### Deployment

1. Clone this repository

2. Create an R2 bucket:
   ```bash
   wrangler r2 bucket create nix-cache
   ```

3. Configure R2 lifecycle rules (optional, recommended):
   ```bash
   # Set objects to expire after 3 days
   # Configure via Cloudflare dashboard: R2 > your-bucket > Settings > Object lifecycle rules
   ```

4. Set secrets:
   ```bash
   wrangler secret put READ_TOKEN
   wrangler secret put WRITE_TOKEN
   ```

5. Deploy:
   ```bash
   wrangler deploy
   ```

## Usage with GitHub Actions

Cubby works with [magic-nix-cache-action](https://github.com/DeterminateSystems/magic-nix-cache-action) for automatic caching in CI:

```yaml
name: CI
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: DeterminateSystems/nix-installer-action@main

      - uses: DeterminateSystems/magic-nix-cache-action@main
        with:
          upstream-cache: https://your-worker.workers.dev
          upstream-cache-token: ${{ secrets.CUBBY_WRITE_TOKEN }}

      - run: nix build
```

For read-only access (e.g., in forks or PRs from external contributors):

```yaml
      - uses: DeterminateSystems/magic-nix-cache-action@main
        with:
          upstream-cache: https://your-worker.workers.dev
          upstream-cache-token: ${{ secrets.CUBBY_READ_TOKEN }}
```

## Configuration

### Secrets

| Secret | Description |
|--------|-------------|
| `READ_TOKEN` | Token for read-only access (downloading cached paths) |
| `WRITE_TOKEN` | Token for read-write access (uploading and downloading) |

### Environment Variables

Configure in `wrangler.toml`:

| Variable | Description | Default |
|----------|-------------|---------|
| `BUCKET_BINDING` | R2 bucket binding name | `CACHE` |

### R2 Bucket Binding

Ensure your `wrangler.toml` includes the R2 binding:

```toml
[[r2_buckets]]
binding = "CACHE"
bucket_name = "nix-cache"
```

## How It Works

Cubby implements a subset of the Attic API:

- `GET /cache-info` - Cache metadata
- `GET /:narinfo` - Fetch .narinfo files
- `GET /nar/:hash` - Fetch NAR files
- `PUT /:narinfo` - Upload .narinfo files (requires write token)
- `PUT /nar/:hash` - Upload NAR files (requires write token)

No deduplication is performed - each store path is stored independently. This keeps the implementation simple and relies on R2 lifecycle rules to manage storage costs.

## License

MIT
