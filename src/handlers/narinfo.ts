// src/handlers/narinfo.ts

/**
 * Nix base32 alphabet (note: e, o, u, t are excluded).
 */
const NIX_BASE32_REGEX = /^[0123456789abcdfghijklmnpqrsvwxyz]{32}$/;

/**
 * Validate a store path hash format.
 * Nix store path hashes are 32 characters using a custom base32 alphabet.
 */
export function isValidStorePathHash(hash: string): boolean {
  return NIX_BASE32_REGEX.test(hash);
}

export interface GetNarinfoResult {
  found: boolean;
  content?: string;
  invalidHash?: boolean;
}

/**
 * Fetch a narinfo file from the bucket.
 */
export async function handleGetNarinfo(
  bucket: R2Bucket,
  hash: string
): Promise<GetNarinfoResult> {
  if (!isValidStorePathHash(hash)) {
    return { found: false, invalidHash: true };
  }

  const object = await bucket.get(`${hash}.narinfo`);

  if (!object) {
    return { found: false };
  }

  const content = await object.text();
  return { found: true, content };
}

export interface HeadNarinfoResult {
  exists: boolean;
  invalidHash?: boolean;
}

/**
 * Check if a narinfo file exists in the bucket.
 */
export async function handleHeadNarinfo(
  bucket: R2Bucket,
  hash: string
): Promise<HeadNarinfoResult> {
  if (!isValidStorePathHash(hash)) {
    return { exists: false, invalidHash: true };
  }

  const head = await bucket.head(`${hash}.narinfo`);
  return { exists: head !== null };
}
