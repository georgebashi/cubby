// src/handlers/narinfo.ts
export interface GetNarinfoResult {
  found: boolean;
  content?: string;
}

/**
 * Fetch a narinfo file from the bucket.
 */
export async function handleGetNarinfo(
  bucket: R2Bucket,
  hash: string
): Promise<GetNarinfoResult> {
  const object = await bucket.get(`${hash}.narinfo`);

  if (!object) {
    return { found: false };
  }

  const content = await object.text();
  return { found: true, content };
}

/**
 * Check if a narinfo file exists in the bucket.
 */
export async function handleHeadNarinfo(
  bucket: R2Bucket,
  hash: string
): Promise<boolean> {
  const head = await bucket.head(`${hash}.narinfo`);
  return head !== null;
}
