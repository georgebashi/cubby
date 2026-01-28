// src/handlers/upload.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleUpload, parseNarInfoHeader, type UploadNarInfo } from './upload.js';

// Test key pair (DO NOT use in production)
const testPrivateKey = 'MC4CAQAwBQYDK2VwBCIEIHvA+mbf8LQjQbpRHwGdev2LMEqPCfAb6SY9askCfqRu';
const testKeyName = 'test-cache';

// Valid 32-character store path hash for tests
const testHash = 'abc12345678901234567890123456789';
const testDepHash = 'def12345678901234567890123456789';

describe('upload handler', () => {
  describe('parseNarInfoHeader', () => {
    it('parses valid nar info JSON', () => {
      const input: UploadNarInfo = {
        cache: 'main',
        store_path_hash: testHash,
        store_path: `/nix/store/${testHash}-test`,
        references: [`/nix/store/${testDepHash}-dep`],
        nar_hash: 'sha256:xyz789',
        nar_size: 12345,
        sigs: [],
      };

      const result = parseNarInfoHeader(JSON.stringify(input));

      expect(result.store_path_hash).toBe(testHash);
      expect(result.store_path).toBe(`/nix/store/${testHash}-test`);
      expect(result.nar_hash).toBe('sha256:xyz789');
    });
  });

  describe('handleUpload', () => {
    it('uploads NAR and creates narinfo', async () => {
      const mockNarBody = new ReadableStream();
      const mockBucket = {
        put: vi.fn().mockResolvedValue({}),
        head: vi.fn().mockResolvedValue(null), // NAR doesn't exist yet
      };

      const narInfo: UploadNarInfo = {
        cache: 'main',
        store_path_hash: testHash,
        store_path: `/nix/store/${testHash}-test`,
        references: [],
        nar_hash: 'sha256:xyz789',
        nar_size: 12345,
        sigs: [],
        compression: 'zstd',
        file_hash: 'sha256:filehash',
        file_size: 5000,
      };

      const result = await handleUpload({
        bucket: mockBucket as unknown as R2Bucket,
        narInfo,
        narBody: mockNarBody,
        signingKey: testPrivateKey,
        signingKeyName: testKeyName,
      });

      expect(result.kind).toBe('Uploaded');
      expect(result.file_size).toBe(5000);
      expect(mockBucket.put).toHaveBeenCalledTimes(2); // NAR + narinfo
    });

    it('skips NAR upload if already exists (dedup by hash)', async () => {
      const mockNarBody = new ReadableStream();
      const mockBucket = {
        put: vi.fn().mockResolvedValue({}),
        head: vi.fn().mockResolvedValue({ key: 'exists' }), // NAR already exists
      };

      const narInfo: UploadNarInfo = {
        cache: 'main',
        store_path_hash: testHash,
        store_path: `/nix/store/${testHash}-test`,
        references: [],
        nar_hash: 'sha256:xyz789',
        nar_size: 12345,
        sigs: [],
        compression: 'zstd',
        file_hash: 'sha256:existinghash',
        file_size: 5000,
      };

      await handleUpload({
        bucket: mockBucket as unknown as R2Bucket,
        narInfo,
        narBody: mockNarBody,
        signingKey: testPrivateKey,
        signingKeyName: testKeyName,
      });

      // Only narinfo should be written (NAR already exists)
      expect(mockBucket.put).toHaveBeenCalledTimes(1);
    });
  });
});
