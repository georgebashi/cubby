// src/handlers/get-missing.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleGetMissing } from './get-missing.js';

describe('handleGetMissing', () => {
  it('returns hashes not found in bucket', async () => {
    const mockBucket = {
      head: vi.fn().mockImplementation((key: string) => {
        // abc123 exists, def456 and ghi789 don't
        if (key === 'abc123.narinfo') {
          return Promise.resolve({ key });
        }
        return Promise.resolve(null);
      }),
    };

    const result = await handleGetMissing(
      mockBucket as unknown as R2Bucket,
      ['abc123', 'def456', 'ghi789']
    );

    expect(result.missing_paths).toEqual(['def456', 'ghi789']);
  });

  it('returns all hashes when none exist', async () => {
    const mockBucket = {
      head: vi.fn().mockResolvedValue(null),
    };

    const result = await handleGetMissing(
      mockBucket as unknown as R2Bucket,
      ['abc123', 'def456']
    );

    expect(result.missing_paths).toEqual(['abc123', 'def456']);
  });

  it('returns empty array when all exist', async () => {
    const mockBucket = {
      head: vi.fn().mockResolvedValue({ key: 'exists' }),
    };

    const result = await handleGetMissing(
      mockBucket as unknown as R2Bucket,
      ['abc123', 'def456']
    );

    expect(result.missing_paths).toEqual([]);
  });
});
