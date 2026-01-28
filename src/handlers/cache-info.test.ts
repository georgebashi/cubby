// src/handlers/cache-info.test.ts
// Tests based on Attic's server/src/nix_manifest/tests.rs test_basic
import { describe, it, expect } from 'vitest';
import { handleCacheInfo, parseCacheInfo } from './cache-info.js';

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

// Nix manifest format tests (Attic test_basic equivalent)
describe('parseCacheInfo (nix manifest format)', () => {
  it('parses standard cache-info format', () => {
    const cacheInfo = `StoreDir: /nix/store
WantMassQuery: 1
Priority: 40`;

    const parsed = parseCacheInfo(cacheInfo);

    expect(parsed.storeDir).toBe('/nix/store');
    expect(parsed.wantMassQuery).toBe(true);
    expect(parsed.priority).toBe(40);
  });

  it('parses WantMassQuery: 0 as false', () => {
    const cacheInfo = `StoreDir: /nix/store
WantMassQuery: 0
Priority: 40`;

    const parsed = parseCacheInfo(cacheInfo);
    expect(parsed.wantMassQuery).toBe(false);
  });

  it('round-trips correctly (test_basic)', () => {
    // Based on Attic's test_basic - generate, parse, verify
    const original = handleCacheInfo('41');
    const parsed = parseCacheInfo(original);

    expect(parsed.storeDir).toBe('/nix/store');
    expect(parsed.wantMassQuery).toBe(true);
    expect(parsed.priority).toBe(41);
  });

  it('handles numeric values correctly (test_unquoted_number equivalent)', () => {
    // Attic's test_unquoted_number tests that numbers are parsed as strings/numbers appropriately
    const cacheInfo = `StoreDir: /nix/store
WantMassQuery: 1
Priority: 12345`;

    const parsed = parseCacheInfo(cacheInfo);
    expect(parsed.priority).toBe(12345);
    expect(typeof parsed.priority).toBe('number');
  });

  it('handles whitespace around values', () => {
    const cacheInfo = `StoreDir:  /nix/store
WantMassQuery:  1
Priority:  40`;

    const parsed = parseCacheInfo(cacheInfo);
    expect(parsed.storeDir).toBe('/nix/store');
    expect(parsed.wantMassQuery).toBe(true);
    expect(parsed.priority).toBe(40);
  });
});
