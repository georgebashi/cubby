// src/handlers/narinfo.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleGetNarinfo, handleHeadNarinfo } from './narinfo.js';

describe('narinfo handlers', () => {
  describe('handleGetNarinfo', () => {
    it('returns narinfo content when found', async () => {
      const mockContent = 'StorePath: /nix/store/abc123-test\nNarHash: sha256:xyz';
      const mockBucket = {
        get: vi.fn().mockResolvedValue({
          text: () => Promise.resolve(mockContent),
        }),
      };

      const result = await handleGetNarinfo(mockBucket as unknown as R2Bucket, 'abc123');

      expect(result.found).toBe(true);
      expect(result.content).toBe(mockContent);
    });

    it('returns not found when narinfo missing', async () => {
      const mockBucket = {
        get: vi.fn().mockResolvedValue(null),
      };

      const result = await handleGetNarinfo(mockBucket as unknown as R2Bucket, 'nonexistent');

      expect(result.found).toBe(false);
    });
  });

  describe('handleHeadNarinfo', () => {
    it('returns true when narinfo exists', async () => {
      const mockBucket = {
        head: vi.fn().mockResolvedValue({ key: 'abc123.narinfo' }),
      };

      const result = await handleHeadNarinfo(mockBucket as unknown as R2Bucket, 'abc123');

      expect(result).toBe(true);
    });

    it('returns false when narinfo missing', async () => {
      const mockBucket = {
        head: vi.fn().mockResolvedValue(null),
      };

      const result = await handleHeadNarinfo(mockBucket as unknown as R2Bucket, 'nonexistent');

      expect(result).toBe(false);
    });
  });
});
