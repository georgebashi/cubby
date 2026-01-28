// src/handlers/get-missing.ts
export interface GetMissingRequest {
  cache: string;
  store_path_hashes: string[];
}

export interface GetMissingResponse {
  missing_paths: string[];
}

/**
 * Check which store path hashes are missing from the cache.
 */
export async function handleGetMissing(
  bucket: R2Bucket,
  storePathHashes: string[]
): Promise<GetMissingResponse> {
  const missing: string[] = [];

  // Check each hash in parallel
  const checks = await Promise.all(
    storePathHashes.map(async (hash) => {
      const exists = await bucket.head(`${hash}.narinfo`);
      return { hash, exists: exists !== null };
    })
  );

  for (const { hash, exists } of checks) {
    if (!exists) {
      missing.push(hash);
    }
  }

  return { missing_paths: missing };
}
