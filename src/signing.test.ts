// src/signing.test.ts
import { describe, it, expect } from 'vitest';
import { signNarinfo, getPublicKey, buildFingerprint } from './signing.js';

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

  it('produces deterministic signatures', () => {
    const fingerprint = '1;/nix/store/abc123-test;sha256:def456;12345;';
    const sig1 = signNarinfo(testPrivateKey, testKeyName, fingerprint);
    const sig2 = signNarinfo(testPrivateKey, testKeyName, fingerprint);

    expect(sig1).toBe(sig2);
  });
});

describe('buildFingerprint', () => {
  it('builds fingerprint with correct format', () => {
    const fingerprint = buildFingerprint(
      '/nix/store/abc123-test',
      'sha256:def456',
      12345,
      []
    );

    expect(fingerprint).toBe('1;/nix/store/abc123-test;sha256:def456;12345;');
  });

  it('includes references as comma-separated list', () => {
    const fingerprint = buildFingerprint(
      '/nix/store/abc123-test',
      'sha256:def456',
      12345,
      ['/nix/store/xyz789-dep1', '/nix/store/qrs456-dep2']
    );

    expect(fingerprint).toBe(
      '1;/nix/store/abc123-test;sha256:def456;12345;/nix/store/xyz789-dep1,/nix/store/qrs456-dep2'
    );
  });

  it('handles single reference', () => {
    const fingerprint = buildFingerprint(
      '/nix/store/abc123-test',
      'sha256:def456',
      12345,
      ['/nix/store/xyz789-dep']
    );

    expect(fingerprint).toBe(
      '1;/nix/store/abc123-test;sha256:def456;12345;/nix/store/xyz789-dep'
    );
  });

  it('uses full store paths for references (Nix compatibility)', () => {
    // Nix expects references in fingerprint to be full store paths
    // This test documents the expected format
    const fingerprint = buildFingerprint(
      '/nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10',
      'sha256:16mvl7v0ylzcg2n3xzjn41qhzbmgcn5iyarx16nn5l2r36n2kqci',
      206104,
      [
        '/nix/store/563528481rvhc5kxwipjmg6rqrl95mdx-glibc-2.33-56',
        '/nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10',
      ]
    );

    expect(fingerprint).toBe(
      '1;/nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10;sha256:16mvl7v0ylzcg2n3xzjn41qhzbmgcn5iyarx16nn5l2r36n2kqci;206104;/nix/store/563528481rvhc5kxwipjmg6rqrl95mdx-glibc-2.33-56,/nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10'
    );
  });
});
