// src/handlers/upload.ts
import { generateNarinfo, type NarinfoData } from '../narinfo.js';
import { signNarinfo, buildFingerprint } from '../signing.js';

export interface UploadNarInfo {
  cache: string;
  store_path_hash: string;
  store_path: string;
  references: string[];
  nar_hash: string;
  nar_size: number;
  sigs: string[];
  compression?: string;
  file_hash?: string;
  file_size?: number;
  system?: string;
  deriver?: string;
  ca?: string;
}

export interface UploadResult {
  kind: 'Uploaded' | 'Deduplicated';
  file_size?: number;
}

export interface UploadInput {
  bucket: R2Bucket;
  narInfo: UploadNarInfo;
  narBody: ReadableStream;
  signingKey: string;
  signingKeyName: string;
}

/**
 * Parse the nar info from the X-Attic-Nar-Info header.
 */
export function parseNarInfoHeader(header: string): UploadNarInfo {
  return JSON.parse(header) as UploadNarInfo;
}

/**
 * Extract references as just the hash-name portion (without /nix/store/).
 */
function extractReferenceNames(references: string[]): string[] {
  return references.map((ref) => {
    if (ref.startsWith('/nix/store/')) {
      return ref.slice('/nix/store/'.length);
    }
    return ref;
  });
}

/**
 * Handle upload of a store path (NAR + narinfo).
 */
export async function handleUpload(input: UploadInput): Promise<UploadResult> {
  const { bucket, narInfo, narBody, signingKey, signingKeyName } = input;

  const compression = narInfo.compression || 'none';
  const fileHash = narInfo.file_hash || narInfo.nar_hash;
  const fileSize = narInfo.file_size || narInfo.nar_size;

  // Extract just the hash portion from file_hash for the filename
  const hashValue = fileHash.split(':')[1] || fileHash;
  const ext = compression === 'none' ? '' : `.${compression}`;
  const narFilename = `nar/${hashValue}.nar${ext}`;

  // Check if NAR already exists (content-addressed dedup)
  const existing = await bucket.head(narFilename);

  if (!existing) {
    // Upload the NAR file
    await bucket.put(narFilename, narBody, {
      httpMetadata: {
        contentType: 'application/x-nix-nar',
      },
    });
  }

  // Build fingerprint and sign
  const fingerprint = buildFingerprint(
    narInfo.store_path,
    narInfo.nar_hash,
    narInfo.nar_size,
    narInfo.references
  );
  const signature = signNarinfo(signingKey, signingKeyName, fingerprint);

  // Generate narinfo content
  const narinfoData: NarinfoData = {
    storePath: narInfo.store_path,
    url: narFilename,
    compression,
    fileHash,
    fileSize,
    narHash: narInfo.nar_hash,
    narSize: narInfo.nar_size,
    references: extractReferenceNames(narInfo.references),
    sig: signature,
    deriver: narInfo.deriver,
    system: narInfo.system,
    ca: narInfo.ca,
  };

  const narinfoContent = generateNarinfo(narinfoData);

  // Store the narinfo
  await bucket.put(`${narInfo.store_path_hash}.narinfo`, narinfoContent, {
    httpMetadata: {
      contentType: 'text/x-nix-narinfo',
    },
  });

  return {
    kind: existing ? 'Deduplicated' : 'Uploaded',
    file_size: fileSize,
  };
}
