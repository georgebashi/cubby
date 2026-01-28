// src/narinfo.test.ts
import { describe, it, expect } from 'vitest';
import { parseNarinfo, generateNarinfo, extractHashFromStorePath, type NarinfoData } from './narinfo.js';

// Real narinfo from cache.nixos.org (used by Attic tests for compatibility)
// This is the test data from Attic's server/src/narinfo/tests.rs
const cacheNixosOrgNarinfo = `StorePath: /nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10
URL: nar/0nqgf15qfiacfxrgm2wkw0gwwncjqqzzalj8rs14w9srkydkjsk9.nar.xz
Compression: xz
FileHash: sha256:0nqgf15qfiacfxrgm2wkw0gwwncjqqzzalj8rs14w9srkydkjsk9
FileSize: 41104
NarHash: sha256:16mvl7v0ylzcg2n3xzjn41qhzbmgcn5iyarx16nn5l2r36n2kqci
NarSize: 206104
References: 563528481rvhc5kxwipjmg6rqrl95mdx-glibc-2.33-56 xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10
Deriver: vvb4wxmnjixmrkhmj2xb75z62hrr41i7-hello-2.10.drv
Sig: cache.nixos.org-1:lo9EfNIL4eGRuNh7DTbAAffWPpI2SlYC/8uP7JnhgmfRIUNGhSbFe8qEaKN0mFS02TuhPpXFPNtRkFcCp0hGAQ==`;

const sampleNarinfo = `StorePath: /nix/store/abc123-openssl-3.0.0
URL: nar/xyz789.nar.zst
Compression: zstd
FileHash: sha256:xyz789abcdef
FileSize: 1234567
NarHash: sha256:def456abcdef
NarSize: 2345678
References: abc123-openssl-3.0.0 def456-glibc-2.35
Sig: cache-1:base64signature==`;

describe('narinfo', () => {

  it('parses narinfo format', () => {
    const parsed = parseNarinfo(sampleNarinfo);

    expect(parsed.storePath).toBe('/nix/store/abc123-openssl-3.0.0');
    expect(parsed.url).toBe('nar/xyz789.nar.zst');
    expect(parsed.compression).toBe('zstd');
    expect(parsed.fileHash).toBe('sha256:xyz789abcdef');
    expect(parsed.fileSize).toBe(1234567);
    expect(parsed.narHash).toBe('sha256:def456abcdef');
    expect(parsed.narSize).toBe(2345678);
    expect(parsed.references).toEqual(['abc123-openssl-3.0.0', 'def456-glibc-2.35']);
    expect(parsed.sig).toBe('cache-1:base64signature==');
  });

  it('generates narinfo format', () => {
    const data: NarinfoData = {
      storePath: '/nix/store/abc123-test',
      url: 'nar/abc123.nar.zst',
      compression: 'zstd',
      fileHash: 'sha256:filehash',
      fileSize: 1000,
      narHash: 'sha256:narhash',
      narSize: 2000,
      references: ['dep1', 'dep2'],
      sig: 'key:sig',
    };

    const output = generateNarinfo(data);

    expect(output).toContain('StorePath: /nix/store/abc123-test');
    expect(output).toContain('URL: nar/abc123.nar.zst');
    expect(output).toContain('NarHash: sha256:narhash');
    expect(output).toContain('References: dep1 dep2');
    expect(output).toContain('Sig: key:sig');
  });

  it('handles empty references', () => {
    const data: NarinfoData = {
      storePath: '/nix/store/abc123-test',
      url: 'nar/abc123.nar',
      compression: 'none',
      fileHash: 'sha256:filehash',
      fileSize: 1000,
      narHash: 'sha256:narhash',
      narSize: 1000,
      references: [],
      sig: 'key:sig',
    };

    const output = generateNarinfo(data);
    expect(output).toContain('References: ');
  });

  it('generates narinfo with trailing newline', () => {
    const data: NarinfoData = {
      storePath: '/nix/store/abc123-test',
      url: 'nar/abc123.nar',
      compression: 'none',
      fileHash: 'sha256:filehash',
      fileSize: 1000,
      narHash: 'sha256:narhash',
      narSize: 1000,
      references: [],
      sig: 'key:sig',
    };

    const output = generateNarinfo(data);
    expect(output.endsWith('\n')).toBe(true);
  });

  it('outputs Sig before CA in standard Nix field order', () => {
    const data: NarinfoData = {
      storePath: '/nix/store/abc123-test',
      url: 'nar/abc123.nar',
      compression: 'none',
      fileHash: 'sha256:filehash',
      fileSize: 1000,
      narHash: 'sha256:narhash',
      narSize: 1000,
      references: [],
      sig: 'key:signature',
      ca: 'fixed:sha256:abc123',
    };

    const output = generateNarinfo(data);
    const sigIndex = output.indexOf('Sig:');
    const caIndex = output.indexOf('CA:');

    expect(sigIndex).toBeGreaterThan(-1);
    expect(caIndex).toBeGreaterThan(-1);
    expect(sigIndex).toBeLessThan(caIndex);
  });

  it('round-trips narinfo correctly', () => {
    const original: NarinfoData = {
      storePath: '/nix/store/abc123-openssl-3.0.0',
      url: 'nar/xyz789.nar.zst',
      compression: 'zstd',
      fileHash: 'sha256:xyz789abcdef',
      fileSize: 1234567,
      narHash: 'sha256:def456abcdef',
      narSize: 2345678,
      references: ['abc123-openssl-3.0.0', 'def456-glibc-2.35'],
      sig: 'cache-1:base64signature==',
      deriver: 'abc123-openssl.drv',
    };

    const generated = generateNarinfo(original);
    const parsed = parseNarinfo(generated);

    expect(parsed.storePath).toBe(original.storePath);
    expect(parsed.url).toBe(original.url);
    expect(parsed.compression).toBe(original.compression);
    expect(parsed.narHash).toBe(original.narHash);
    expect(parsed.narSize).toBe(original.narSize);
    expect(parsed.references).toEqual(original.references);
    expect(parsed.sig).toBe(original.sig);
  });

  // Attic compatibility tests using real cache.nixos.org data
  describe('cache.nixos.org compatibility (Attic test data)', () => {
    it('parses real cache.nixos.org narinfo for hello-2.10', () => {
      const parsed = parseNarinfo(cacheNixosOrgNarinfo);

      expect(parsed.storePath).toBe('/nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10');
      expect(parsed.url).toBe('nar/0nqgf15qfiacfxrgm2wkw0gwwncjqqzzalj8rs14w9srkydkjsk9.nar.xz');
      expect(parsed.compression).toBe('xz');
      expect(parsed.fileHash).toBe('sha256:0nqgf15qfiacfxrgm2wkw0gwwncjqqzzalj8rs14w9srkydkjsk9');
      expect(parsed.fileSize).toBe(41104);
      expect(parsed.narHash).toBe('sha256:16mvl7v0ylzcg2n3xzjn41qhzbmgcn5iyarx16nn5l2r36n2kqci');
      expect(parsed.narSize).toBe(206104);
      expect(parsed.references).toEqual([
        '563528481rvhc5kxwipjmg6rqrl95mdx-glibc-2.33-56',
        'xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10',
      ]);
      expect(parsed.deriver).toBe('vvb4wxmnjixmrkhmj2xb75z62hrr41i7-hello-2.10.drv');
      expect(parsed.sig).toBe('cache.nixos.org-1:lo9EfNIL4eGRuNh7DTbAAffWPpI2SlYC/8uP7JnhgmfRIUNGhSbFe8qEaKN0mFS02TuhPpXFPNtRkFcCp0hGAQ==');
    });

    it('round-trips cache.nixos.org narinfo correctly', () => {
      const parsed = parseNarinfo(cacheNixosOrgNarinfo);
      const generated = generateNarinfo(parsed);
      const reparsed = parseNarinfo(generated);

      expect(reparsed.storePath).toBe(parsed.storePath);
      expect(reparsed.url).toBe(parsed.url);
      expect(reparsed.compression).toBe(parsed.compression);
      expect(reparsed.fileHash).toBe(parsed.fileHash);
      expect(reparsed.fileSize).toBe(parsed.fileSize);
      expect(reparsed.narHash).toBe(parsed.narHash);
      expect(reparsed.narSize).toBe(parsed.narSize);
      expect(reparsed.references).toEqual(parsed.references);
      expect(reparsed.deriver).toBe(parsed.deriver);
      expect(reparsed.sig).toBe(parsed.sig);
    });

    it('extracts correct store dir from store path', () => {
      const parsed = parseNarinfo(cacheNixosOrgNarinfo);
      // Store dir should be /nix/store (standard Nix store)
      expect(parsed.storePath.startsWith('/nix/store/')).toBe(true);
    });
  });

  // Edge case tests (from Attic test patterns)
  describe('edge cases', () => {
    it('treats "unknown-deriver" as undefined (Attic test_deriver)', () => {
      // From Attic's test_deriver in server/src/narinfo/tests.rs
      const narinfoWithUnknownDeriver = `StorePath: /nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10
URL: nar/0nqgf15qfiacfxrgm2wkw0gwwncjqqzzalj8rs14w9srkydkjsk9.nar.xz
Compression: xz
FileHash: sha256:0nqgf15qfiacfxrgm2wkw0gwwncjqqzzalj8rs14w9srkydkjsk9
FileSize: 41104
NarHash: sha256:16mvl7v0ylzcg2n3xzjn41qhzbmgcn5iyarx16nn5l2r36n2kqci
NarSize: 206104
References: 563528481rvhc5kxwipjmg6rqrl95mdx-glibc-2.33-56 xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10
Deriver: unknown-deriver`;

      const parsed = parseNarinfo(narinfoWithUnknownDeriver);

      // Attic treats "unknown-deriver" as None
      expect(parsed.deriver).toBeUndefined();
    });

    it('parses narinfo without optional fields', () => {
      const minimalNarinfo = `StorePath: /nix/store/abc123-test
URL: nar/abc123.nar
Compression: none
FileHash: sha256:filehash
FileSize: 1000
NarHash: sha256:narhash
NarSize: 1000
References:
Sig: key:sig`;

      const parsed = parseNarinfo(minimalNarinfo);

      expect(parsed.storePath).toBe('/nix/store/abc123-test');
      expect(parsed.deriver).toBeUndefined();
      expect(parsed.system).toBeUndefined();
      expect(parsed.ca).toBeUndefined();
    });

    it('parses empty References line', () => {
      const narinfoEmptyRefs = `StorePath: /nix/store/abc123-test
URL: nar/abc123.nar
Compression: none
FileHash: sha256:filehash
FileSize: 1000
NarHash: sha256:narhash
NarSize: 1000
References:
Sig: key:sig`;

      const parsed = parseNarinfo(narinfoEmptyRefs);

      expect(parsed.references).toEqual([]);
    });

    it('handles xz compression', () => {
      const parsed = parseNarinfo(cacheNixosOrgNarinfo);
      expect(parsed.compression).toBe('xz');
    });

    it('handles zstd compression', () => {
      const parsed = parseNarinfo(sampleNarinfo);
      expect(parsed.compression).toBe('zstd');
    });

    it('handles none compression', () => {
      const narinfoNoCompression = `StorePath: /nix/store/abc123-test
URL: nar/abc123.nar
Compression: none
FileHash: sha256:filehash
FileSize: 1000
NarHash: sha256:narhash
NarSize: 1000
References:
Sig: key:sig`;

      const parsed = parseNarinfo(narinfoNoCompression);

      expect(parsed.compression).toBe('none');
    });

    it('handles leading/trailing whitespace in content', () => {
      const narinfoWithWhitespace = `
StorePath: /nix/store/abc123-test
URL: nar/abc123.nar
Compression: none
FileHash: sha256:filehash
FileSize: 1000
NarHash: sha256:narhash
NarSize: 1000
References:
Sig: key:sig
`;

      const parsed = parseNarinfo(narinfoWithWhitespace);

      expect(parsed.storePath).toBe('/nix/store/abc123-test');
      expect(parsed.sig).toBe('key:sig');
    });

    it('handles whitespace around values', () => {
      const narinfoWithSpaces = `StorePath:  /nix/store/abc123-test
URL:  nar/abc123.nar
Compression:  none
FileHash:  sha256:filehash
FileSize:  1000
NarHash:  sha256:narhash
NarSize:  1000
References:
Sig:  key:sig`;

      const parsed = parseNarinfo(narinfoWithSpaces);

      expect(parsed.storePath).toBe('/nix/store/abc123-test');
      expect(parsed.compression).toBe('none');
      expect(parsed.fileSize).toBe(1000);
    });

    it('parses CA field for content-addressed paths', () => {
      const narinfoWithCa = `StorePath: /nix/store/abc123-test
URL: nar/abc123.nar
Compression: none
FileHash: sha256:filehash
FileSize: 1000
NarHash: sha256:narhash
NarSize: 1000
References:
Sig: key:sig
CA: fixed:sha256:abc123def456`;

      const parsed = parseNarinfo(narinfoWithCa);

      expect(parsed.ca).toBe('fixed:sha256:abc123def456');
    });

    it('parses System field', () => {
      const narinfoWithSystem = `StorePath: /nix/store/abc123-test
URL: nar/abc123.nar
Compression: none
FileHash: sha256:filehash
FileSize: 1000
NarHash: sha256:narhash
NarSize: 1000
References:
System: x86_64-linux
Sig: key:sig`;

      const parsed = parseNarinfo(narinfoWithSystem);

      expect(parsed.system).toBe('x86_64-linux');
    });
  });
});

// Hash format tests (based on Attic's attic/src/hash/tests/mod.rs)
describe('hash format validation', () => {
  describe('extractHashFromStorePath', () => {
    it('extracts hash from standard store path', () => {
      expect(extractHashFromStorePath('/nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10'))
        .toBe('xcp9cav49dmsjbwdjlmkjxj10gkpx553');
    });

    it('extracts hash from glibc path (Attic test data)', () => {
      expect(extractHashFromStorePath('/nix/store/563528481rvhc5kxwipjmg6rqrl95mdx-glibc-2.33-56'))
        .toBe('563528481rvhc5kxwipjmg6rqrl95mdx');
    });

    it('returns empty string for invalid paths', () => {
      expect(extractHashFromStorePath('/invalid/path')).toBe('');
      expect(extractHashFromStorePath('not-a-store-path')).toBe('');
      expect(extractHashFromStorePath('')).toBe('');
    });
  });

  describe('narHash format (typed hash strings)', () => {
    it('parses base32 narHash from cache.nixos.org', () => {
      // From Attic test data - this is the Nix base32 format
      const narinfo = parseNarinfo(cacheNixosOrgNarinfo);
      expect(narinfo.narHash).toBe('sha256:16mvl7v0ylzcg2n3xzjn41qhzbmgcn5iyarx16nn5l2r36n2kqci');
    });

    it('accepts both base32 and base16 hash formats', () => {
      // Nix supports both formats
      // Base32 (52 chars): sha256:16mvl7v0ylzcg2n3xzjn41qhzbmgcn5iyarx16nn5l2r36n2kqci
      // Base16 (64 chars): sha256:91e129ac1959d062ad093d2b1f8b65afae0f712056fe3eac78ec530ff6a1bb9a

      const narinfoBase32 = `StorePath: /nix/store/abc123-test
URL: nar/abc123.nar
Compression: none
FileHash: sha256:filehash
FileSize: 1000
NarHash: sha256:16mvl7v0ylzcg2n3xzjn41qhzbmgcn5iyarx16nn5l2r36n2kqci
NarSize: 1000
References:
Sig: key:sig`;

      const narinfoBase16 = `StorePath: /nix/store/abc123-test
URL: nar/abc123.nar
Compression: none
FileHash: sha256:filehash
FileSize: 1000
NarHash: sha256:91e129ac1959d062ad093d2b1f8b65afae0f712056fe3eac78ec530ff6a1bb9a
NarSize: 1000
References:
Sig: key:sig`;

      const parsedBase32 = parseNarinfo(narinfoBase32);
      const parsedBase16 = parseNarinfo(narinfoBase16);

      // Both should parse successfully
      expect(parsedBase32.narHash).toBe('sha256:16mvl7v0ylzcg2n3xzjn41qhzbmgcn5iyarx16nn5l2r36n2kqci');
      expect(parsedBase16.narHash).toBe('sha256:91e129ac1959d062ad093d2b1f8b65afae0f712056fe3eac78ec530ff6a1bb9a');
    });

    it('preserves hash format through round-trip', () => {
      const original = parseNarinfo(cacheNixosOrgNarinfo);
      const generated = generateNarinfo(original);
      const reparsed = parseNarinfo(generated);

      // Hash format should be preserved exactly
      expect(reparsed.narHash).toBe(original.narHash);
      expect(reparsed.fileHash).toBe(original.fileHash);
    });
  });

  describe('fileHash format', () => {
    it('parses fileHash from cache.nixos.org narinfo', () => {
      const narinfo = parseNarinfo(cacheNixosOrgNarinfo);
      expect(narinfo.fileHash).toBe('sha256:0nqgf15qfiacfxrgm2wkw0gwwncjqqzzalj8rs14w9srkydkjsk9');
    });

    it('uses colon separator for typed hash', () => {
      // Attic test_from_typed tests that hash strings must have colon
      const narinfo = parseNarinfo(cacheNixosOrgNarinfo);
      expect(narinfo.narHash).toContain(':');
      expect(narinfo.fileHash).toContain(':');
    });
  });

  // Attic test_from_typed equivalent - hash format validation
  // Note: Cubby doesn't validate hash encodings server-side (trusts client),
  // but we test format expectations for documentation purposes
  describe('typed hash format expectations (test_from_typed)', () => {
    it('base16 hashes are 64 characters after algorithm prefix', () => {
      // Attic accepts base16: sha256:64-hex-chars
      const base16Hash = 'sha256:91e129ac1959d062ad093d2b1f8b65afae0f712056fe3eac78ec530ff6a1bb9a';
      const narinfo = `StorePath: /nix/store/abc123-test
URL: nar/abc123.nar
Compression: none
FileHash: sha256:filehash
FileSize: 1000
NarHash: ${base16Hash}
NarSize: 1000
References:
Sig: key:sig`;

      const parsed = parseNarinfo(narinfo);
      expect(parsed.narHash).toBe(base16Hash);

      // Verify base16 format: algorithm:64-hex-chars
      const [algo, hash] = parsed.narHash.split(':');
      expect(algo).toBe('sha256');
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('base32 hashes are 52 characters after algorithm prefix', () => {
      // Attic accepts base32: sha256:52-nix-base32-chars
      const base32Hash = 'sha256:16mvl7v0ylzcg2n3xzjn41qhzbmgcn5iyarx16nn5l2r36n2kqci';
      const narinfo = `StorePath: /nix/store/abc123-test
URL: nar/abc123.nar
Compression: none
FileHash: sha256:filehash
FileSize: 1000
NarHash: ${base32Hash}
NarSize: 1000
References:
Sig: key:sig`;

      const parsed = parseNarinfo(narinfo);
      expect(parsed.narHash).toBe(base32Hash);

      // Verify base32 format: algorithm:52-nix-base32-chars
      const [algo, hash] = parsed.narHash.split(':');
      expect(algo).toBe('sha256');
      expect(hash.length).toBe(52);
    });

    it('typed hash requires colon separator', () => {
      // From Attic: hash strings must have colon (algorithm:hash)
      const narinfo = parseNarinfo(cacheNixosOrgNarinfo);
      const [algo, hash] = narinfo.narHash.split(':');

      expect(algo).toBe('sha256');
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
    });
  });
});
