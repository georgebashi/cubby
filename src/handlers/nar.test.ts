// src/handlers/nar.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleGetNar } from './nar.js';

describe('handleGetNar', () => {
  it('returns NAR content when found', async () => {
    const mockBody = new ReadableStream();
    const mockBucket = {
      get: vi.fn().mockResolvedValue({
        body: mockBody,
        httpMetadata: { contentType: 'application/x-nix-nar' },
        size: 12345,
      }),
    };

    const result = await handleGetNar(mockBucket as unknown as R2Bucket, 'abc123.nar.zst');

    expect(result.found).toBe(true);
    expect(result.body).toBe(mockBody);
    expect(result.size).toBe(12345);
  });

  it('returns not found when NAR missing', async () => {
    const mockBucket = {
      get: vi.fn().mockResolvedValue(null),
    };

    const result = await handleGetNar(mockBucket as unknown as R2Bucket, 'nonexistent.nar');

    expect(result.found).toBe(false);
  });
});
