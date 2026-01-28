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
});
