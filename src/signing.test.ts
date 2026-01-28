// src/signing.test.ts
import { describe, it, expect } from 'vitest';
import { signNarinfo, getPublicKey } from './signing.js';

describe('signing', () => {
  // Test key pair (DO NOT use in production)
  const testPrivateKey = 'MC4CAQAwBQYDK2VwBCIEIHvA+mbf8LQjQbpRHwGdev2LMEqPCfAb6SY9askCfqRu';
  const testKeyName = 'test-cache';

  it('signs narinfo fingerprint correctly', () => {
    const fingerprint = '1;/nix/store/abc123-test;sha256:def456;12345;/nix/store/xyz789-dep';
    const signature = signNarinfo(testPrivateKey, testKeyName, fingerprint);

    expect(signature).toMatch(/^test-cache:[A-Za-z0-9+/]+=*$/);
  });

  it('derives public key from private key', () => {
    const publicKey = getPublicKey(testPrivateKey, testKeyName);

    expect(publicKey).toMatch(/^test-cache:[A-Za-z0-9+/]+=*$/);
  });
});
