// src/handlers/cache-config.test.ts
import { describe, it, expect } from 'vitest';
import { handleCacheConfig } from './cache-config.js';

describe('handleCacheConfig', () => {
  it('returns correct cache config JSON', () => {
    const result = handleCacheConfig({
      baseUrl: 'https://cache.example.com',
      publicKey: 'cache-1:pubkey123',
      priority: '40',
    });

    expect(result.substituter_endpoint).toBe('https://cache.example.com');
    expect(result.api_endpoint).toBe('https://cache.example.com');
    expect(result.public_key).toBe('cache-1:pubkey123');
    expect(result.is_public).toBe(false);
    expect(result.priority).toBe(40);
    expect(result.store_dir).toBe('/nix/store');
  });

  it('includes upstream_cache_key_names for Attic API compatibility', () => {
    const result = handleCacheConfig({
      baseUrl: 'https://cache.example.com',
      publicKey: 'cache-1:pubkey123',
      priority: '40',
    });

    // Attic clients expect this field to avoid redundant uploads
    // of store paths signed by upstream caches like cache.nixos.org
    expect(result.upstream_cache_key_names).toEqual([]);
  });

  it('parses priority as integer', () => {
    const result = handleCacheConfig({
      baseUrl: 'https://cache.example.com',
      publicKey: 'cache-1:pubkey123',
      priority: '41',
    });

    expect(result.priority).toBe(41);
    expect(typeof result.priority).toBe('number');
  });
});
