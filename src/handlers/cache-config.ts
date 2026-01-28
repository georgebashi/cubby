// src/handlers/cache-config.ts
export interface CacheConfigResponse {
  substituter_endpoint: string;
  api_endpoint: string;
  public_key: string;
  is_public: boolean;
  priority: number;
  store_dir: string;
}

export interface CacheConfigInput {
  baseUrl: string;
  publicKey: string;
  priority: string;
}

/**
 * Generate cache config response for Attic API compatibility.
 */
export function handleCacheConfig(input: CacheConfigInput): CacheConfigResponse {
  return {
    substituter_endpoint: input.baseUrl,
    api_endpoint: input.baseUrl,
    public_key: input.publicKey,
    is_public: false,
    priority: parseInt(input.priority, 10),
    store_dir: '/nix/store',
  };
}
