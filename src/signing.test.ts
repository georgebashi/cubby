// src/signing.test.ts
import { describe, it, expect } from 'vitest';
import { signNarinfo, getPublicKey, buildFingerprint, verifySignature } from './signing.js';

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

// Attic compatibility tests - signature verification against cache.nixos.org
describe('verifySignature (Attic compatibility)', () => {
  // cache.nixos.org public key (from Attic test suite)
  const cacheNixosOrgPublicKey = 'cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY=';

  // Signature from cache.nixos.org for hello-2.10
  const cacheNixosOrgSignature = 'cache.nixos.org-1:lo9EfNIL4eGRuNh7DTbAAffWPpI2SlYC/8uP7JnhgmfRIUNGhSbFe8qEaKN0mFS02TuhPpXFPNtRkFcCp0hGAQ==';

  // Expected fingerprint for hello-2.10 (from Attic's test_fingerprint)
  const expectedFingerprint = '1;/nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10;sha256:16mvl7v0ylzcg2n3xzjn41qhzbmgcn5iyarx16nn5l2r36n2kqci;206104;/nix/store/563528481rvhc5kxwipjmg6rqrl95mdx-glibc-2.33-56,/nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10';

  it('verifies cache.nixos.org signature for hello-2.10', () => {
    const isValid = verifySignature(
      cacheNixosOrgPublicKey,
      cacheNixosOrgSignature,
      expectedFingerprint
    );

    expect(isValid).toBe(true);
  });

  it('builds correct fingerprint matching Attic expected format', () => {
    // This is the exact fingerprint format Attic expects (test_fingerprint in narinfo/tests.rs)
    const fingerprint = buildFingerprint(
      '/nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10',
      'sha256:16mvl7v0ylzcg2n3xzjn41qhzbmgcn5iyarx16nn5l2r36n2kqci',
      206104,
      [
        '/nix/store/563528481rvhc5kxwipjmg6rqrl95mdx-glibc-2.33-56',
        '/nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10',
      ]
    );

    expect(fingerprint).toBe(expectedFingerprint);
  });

  it('rejects invalid signature', () => {
    // Valid base64 encoding of 64 zero bytes (wrong signature)
    const invalidSignature = 'cache.nixos.org-1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

    const isValid = verifySignature(
      cacheNixosOrgPublicKey,
      invalidSignature,
      expectedFingerprint
    );

    expect(isValid).toBe(false);
  });

  it('rejects signature with wrong fingerprint', () => {
    const wrongFingerprint = '1;/nix/store/wrong-path;sha256:wronghash;12345;';

    const isValid = verifySignature(
      cacheNixosOrgPublicKey,
      cacheNixosOrgSignature,
      wrongFingerprint
    );

    expect(isValid).toBe(false);
  });

  it('verifies own signatures can be verified', () => {
    const testPrivateKey = 'MC4CAQAwBQYDK2VwBCIEIHvA+mbf8LQjQbpRHwGdev2LMEqPCfAb6SY9askCfqRu';
    const testKeyName = 'test-cache';
    const fingerprint = '1;/nix/store/abc123-test;sha256:def456;12345;';

    const signature = signNarinfo(testPrivateKey, testKeyName, fingerprint);
    const publicKey = getPublicKey(testPrivateKey, testKeyName);

    const isValid = verifySignature(publicKey, signature, fingerprint);

    expect(isValid).toBe(true);
  });
});
