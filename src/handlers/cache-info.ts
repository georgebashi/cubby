// src/handlers/cache-info.ts

/**
 * Cache info data structure.
 */
export interface CacheInfo {
  storeDir: string;
  wantMassQuery: boolean;
  priority: number;
}

/**
 * Generate nix-cache-info response.
 */
export function handleCacheInfo(priority: string): string {
  return `StoreDir: /nix/store
WantMassQuery: 1
Priority: ${priority}`;
}

/**
 * Parse nix-cache-info format (Nix manifest format).
 * Based on Attic's server/src/nix_manifest parsing.
 */
export function parseCacheInfo(content: string): CacheInfo {
  const data: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    data[key] = value;
  }

  return {
    storeDir: data['StoreDir'] || '/nix/store',
    wantMassQuery: data['WantMassQuery'] === '1',
    priority: parseInt(data['Priority'] || '40', 10),
  };
}
