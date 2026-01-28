// src/narinfo.ts
export interface NarinfoData {
  storePath: string;
  url: string;
  compression: string;
  fileHash: string;
  fileSize: number;
  narHash: string;
  narSize: number;
  references: string[];
  sig: string;
  deriver?: string;
  system?: string;
  ca?: string;
}

/**
 * Parse a narinfo file into structured data.
 */
export function parseNarinfo(content: string): NarinfoData {
  const lines = content.split('\n');
  const data: Record<string, string> = {};

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    data[key] = value;
  }

  return {
    storePath: data['StorePath'] || '',
    url: data['URL'] || '',
    compression: data['Compression'] || 'none',
    fileHash: data['FileHash'] || '',
    fileSize: parseInt(data['FileSize'] || '0', 10),
    narHash: data['NarHash'] || '',
    narSize: parseInt(data['NarSize'] || '0', 10),
    references: data['References'] ? data['References'].split(' ').filter(Boolean) : [],
    sig: data['Sig'] || '',
    deriver: data['Deriver'],
    system: data['System'],
    ca: data['CA'],
  };
}

/**
 * Generate a narinfo file from structured data.
 */
export function generateNarinfo(data: NarinfoData): string {
  const lines: string[] = [
    `StorePath: ${data.storePath}`,
    `URL: ${data.url}`,
    `Compression: ${data.compression}`,
    `FileHash: ${data.fileHash}`,
    `FileSize: ${data.fileSize}`,
    `NarHash: ${data.narHash}`,
    `NarSize: ${data.narSize}`,
    `References: ${data.references.join(' ')}`,
  ];

  if (data.deriver) {
    lines.push(`Deriver: ${data.deriver}`);
  }
  if (data.system) {
    lines.push(`System: ${data.system}`);
  }
  lines.push(`Sig: ${data.sig}`);

  if (data.ca) {
    lines.push(`CA: ${data.ca}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Extract the hash from a store path.
 * /nix/store/abc123-name -> abc123
 */
export function extractHashFromStorePath(storePath: string): string {
  const match = storePath.match(/\/nix\/store\/([a-z0-9]+)-/);
  return match ? match[1] : '';
}
