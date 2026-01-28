// src/store-path.ts
// Store path utilities based on Attic's attic/src/nix_store tests

/**
 * Nix uses a custom base32 alphabet that excludes e, o, u, t
 * to avoid confusion and offensive words.
 */
const NIX_BASE32_CHARS = '0123456789abcdfghijklmnpqrsvwxyz';

/**
 * Store path hash length (always 32 characters in Nix base32).
 */
const STORE_PATH_HASH_LENGTH = 32;

/**
 * Validate a store path hash.
 * Must be exactly 32 characters using Nix's base32 alphabet.
 *
 * Based on Attic's test_store_path_hash tests.
 */
export function isValidStorePathHash(hash: string): boolean {
  if (hash.length !== STORE_PATH_HASH_LENGTH) {
    return false;
  }

  for (const char of hash) {
    if (!NIX_BASE32_CHARS.includes(char)) {
      return false;
    }
  }

  return true;
}

/**
 * Parse a store path base name into hash and name components.
 * Format: "{32-char-hash}-{name}"
 *
 * Based on Attic's test_base_name tests.
 */
export function parseStorePath(baseName: string): { hash: string; name: string } | null {
  // Must have at least hash + dash + one char for name
  if (baseName.length < STORE_PATH_HASH_LENGTH + 2) {
    return null;
  }

  // Hash must be followed by a dash
  if (baseName[STORE_PATH_HASH_LENGTH] !== '-') {
    return null;
  }

  const hash = baseName.slice(0, STORE_PATH_HASH_LENGTH);
  const name = baseName.slice(STORE_PATH_HASH_LENGTH + 1);

  // Validate hash
  if (!isValidStorePathHash(hash)) {
    return null;
  }

  // Name cannot be empty
  if (name.length === 0) {
    return null;
  }

  // Name must be valid (alphanumeric, dash, underscore, period, plus)
  // Based on Nix's store path name validation
  if (!/^[a-zA-Z0-9+\-._]+$/.test(name)) {
    return null;
  }

  return { hash, name };
}

/**
 * Extract the base name (hash-name) from a full store path.
 * Input: /nix/store/abc123-name or /nix/store/abc123-name/subpath
 * Output: abc123-name
 *
 * Based on Attic's test_to_base_name tests.
 */
export function extractBaseName(
  storePath: string,
  storeDir: string = '/nix/store'
): { baseName: string } | { error: string } {
  // Normalize: remove trailing slashes
  const normalizedPath = storePath.replace(/\/+$/, '');
  const normalizedStoreDir = storeDir.replace(/\/+$/, '');

  // Must start with store directory
  if (!normalizedPath.startsWith(normalizedStoreDir + '/')) {
    // Check if it IS the store directory
    if (normalizedPath === normalizedStoreDir) {
      return { error: 'Path is store directory itself' };
    }
    return { error: 'Path is not in store directory' };
  }

  // Get everything after store directory
  const afterStore = normalizedPath.slice(normalizedStoreDir.length + 1);

  // Extract just the first component (the store path base name)
  const slashIndex = afterStore.indexOf('/');
  const baseName = slashIndex === -1 ? afterStore : afterStore.slice(0, slashIndex);

  // Validate minimum length (hash + dash + at least 1 char)
  if (baseName.length < STORE_PATH_HASH_LENGTH + 2) {
    return { error: 'Path is too short' };
  }

  return { baseName };
}

/**
 * Extract just the hash from a store path.
 * Convenience wrapper around extractBaseName + parseStorePath.
 */
export function extractHashFromPath(storePath: string): string | null {
  const result = extractBaseName(storePath);
  if ('error' in result) {
    return null;
  }

  const parsed = parseStorePath(result.baseName);
  if (!parsed) {
    return null;
  }

  return parsed.hash;
}
