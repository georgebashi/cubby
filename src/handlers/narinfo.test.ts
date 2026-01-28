// src/handlers/narinfo.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleGetNarinfo, handleHeadNarinfo, isValidStorePathHash } from './narinfo.js';

// Valid 32-character Nix base32 hash (no e, o, u, t characters)
const validHash = '0a1b2c3d4f5g6h7i8j9k0l1m2n3p4q5r';

describe('isValidStorePathHash', () => {
  it('accepts valid 32-character Nix base32 hashes', () => {
    expect(isValidStorePathHash('0a1b2c3d4f5g6h7i8j9k0l1m2n3p4q5r')).toBe(true);
    expect(isValidStorePathHash('563528481rvhc5kxwipjmg6rqrl95mdx')).toBe(true);
    expect(isValidStorePathHash('xcp9cav49dmsjbwdjlmkjxj10gkpx553')).toBe(true);
  });

  it('rejects hashes that are too short', () => {
    expect(isValidStorePathHash('abc123')).toBe(false);
    expect(isValidStorePathHash('0a1b2c3d4f5g6h7i8j9k0l1m2n3p4q5')).toBe(false);
  });

  it('rejects hashes that are too long', () => {
    expect(isValidStorePathHash('0a1b2c3d4f5g6h7i8j9k0l1m2n3p4q5rx')).toBe(false);
  });

  it('rejects hashes with invalid characters (e, o, u, t are excluded from Nix base32)', () => {
    // 'e' is not in Nix base32
    expect(isValidStorePathHash('0a1b2c3d4e5g6h7i8j9k0l1m2n3p4q5r')).toBe(false);
    // 'o' is not in Nix base32
    expect(isValidStorePathHash('0a1b2c3d4o5g6h7i8j9k0l1m2n3p4q5r')).toBe(false);
    // 'u' is not in Nix base32
    expect(isValidStorePathHash('0a1b2c3d4u5g6h7i8j9k0l1m2n3p4q5r')).toBe(false);
    // 't' is not in Nix base32
    expect(isValidStorePathHash('0a1b2c3d4t5g6h7i8j9k0l1m2n3p4q5r')).toBe(false);
  });

  it('rejects uppercase letters', () => {
    expect(isValidStorePathHash('0A1B2C3D4F5G6H7I8J9K0L1M2N3P4Q5R')).toBe(false);
  });

  it('rejects special characters', () => {
    expect(isValidStorePathHash('abc123-test.......................')).toBe(false);
    expect(isValidStorePathHash('../../../../../etc/passwd.......')).toBe(false);
  });
});

describe('narinfo handlers', () => {
  describe('handleGetNarinfo', () => {
    it('returns narinfo content when found', async () => {
      const mockContent = 'StorePath: /nix/store/abc123-test\nNarHash: sha256:xyz';
      const mockBucket = {
        get: vi.fn().mockResolvedValue({
          text: () => Promise.resolve(mockContent),
        }),
      };

      const result = await handleGetNarinfo(mockBucket as unknown as R2Bucket, validHash);

      expect(result.found).toBe(true);
      expect(result.content).toBe(mockContent);
    });

    it('returns not found when narinfo missing', async () => {
      const mockBucket = {
        get: vi.fn().mockResolvedValue(null),
      };

      const result = await handleGetNarinfo(mockBucket as unknown as R2Bucket, validHash);

      expect(result.found).toBe(false);
      expect(result.invalidHash).toBeUndefined();
    });

    it('returns invalidHash for malformed hash without querying bucket', async () => {
      const mockBucket = {
        get: vi.fn(),
      };

      const result = await handleGetNarinfo(mockBucket as unknown as R2Bucket, 'invalid');

      expect(result.found).toBe(false);
      expect(result.invalidHash).toBe(true);
      expect(mockBucket.get).not.toHaveBeenCalled();
    });
  });

  describe('handleHeadNarinfo', () => {
    it('returns exists true when narinfo exists', async () => {
      const mockBucket = {
        head: vi.fn().mockResolvedValue({ key: `${validHash}.narinfo` }),
      };

      const result = await handleHeadNarinfo(mockBucket as unknown as R2Bucket, validHash);

      expect(result.exists).toBe(true);
    });

    it('returns exists false when narinfo missing', async () => {
      const mockBucket = {
        head: vi.fn().mockResolvedValue(null),
      };

      const result = await handleHeadNarinfo(mockBucket as unknown as R2Bucket, validHash);

      expect(result.exists).toBe(false);
      expect(result.invalidHash).toBeUndefined();
    });

    it('returns invalidHash for malformed hash without querying bucket', async () => {
      const mockBucket = {
        head: vi.fn(),
      };

      const result = await handleHeadNarinfo(mockBucket as unknown as R2Bucket, 'invalid');

      expect(result.exists).toBe(false);
      expect(result.invalidHash).toBe(true);
      expect(mockBucket.head).not.toHaveBeenCalled();
    });
  });
});
