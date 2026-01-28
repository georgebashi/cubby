// src/handlers/cache-info.ts

/**
 * Generate nix-cache-info response.
 */
export function handleCacheInfo(priority: string): string {
  return `StoreDir: /nix/store
WantMassQuery: 1
Priority: ${priority}`;
}
