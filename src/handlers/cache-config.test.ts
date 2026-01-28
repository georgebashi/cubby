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
});
