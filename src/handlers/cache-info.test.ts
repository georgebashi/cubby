// src/handlers/cache-info.test.ts
import { describe, it, expect } from 'vitest';
import { handleCacheInfo } from './cache-info.js';

describe('handleCacheInfo', () => {
  it('returns correct cache info format', () => {
    const response = handleCacheInfo('40');

    expect(response).toContain('StoreDir: /nix/store');
    expect(response).toContain('WantMassQuery: 1');
    expect(response).toContain('Priority: 40');
  });

  it('outputs Nix-parseable key: value format', () => {
    const response = handleCacheInfo('41');
    const lines = response.split('\n');

    // Each line should have key: value format
    for (const line of lines) {
      if (line.trim()) {
        expect(line).toMatch(/^[A-Za-z]+: .+$/);
      }
    }
  });

  it('uses correct WantMassQuery value for Nix', () => {
    // Nix expects exactly "1" for true (not "true" or other values)
    const response = handleCacheInfo('40');
    expect(response).toContain('WantMassQuery: 1');
  });
});
