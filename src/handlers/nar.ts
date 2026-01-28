// src/handlers/nar.ts
export interface GetNarResult {
  found: boolean;
  body?: ReadableStream;
  contentType?: string;
  size?: number;
}

/**
 * Fetch a NAR file from the bucket.
 */
export async function handleGetNar(
  bucket: R2Bucket,
  filename: string
): Promise<GetNarResult> {
  const object = await bucket.get(`nar/${filename}`);

  if (!object) {
    return { found: false };
  }

  return {
    found: true,
    body: object.body,
    contentType: object.httpMetadata?.contentType || 'application/octet-stream',
    size: object.size,
  };
}
