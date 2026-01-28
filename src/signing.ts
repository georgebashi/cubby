// src/signing.ts
import nacl from 'tweetnacl';

/**
 * Parse a Nix-format key (keyname:base64key) and return just the base64 part.
 */
function parseNixKey(key: string): string {
  const colonIndex = key.indexOf(':');
  if (colonIndex !== -1) {
    // Nix format: "keyname:base64key"
    return key.slice(colonIndex + 1);
  }
  // Already just base64
  return key;
}

/**
 * Decode a base64-encoded Ed25519 private key.
 * Supports raw 32-byte seeds, 64-byte keypairs, and PKCS#8 encoded keys.
 * Also handles Nix-format keys (keyname:base64key).
 */
function decodePrivateKey(key: string): Uint8Array {
  const base64Key = parseNixKey(key);
  const decoded = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));

  if (decoded.length === 32) {
    // 32-byte seed - generate keypair from it
    return nacl.sign.keyPair.fromSeed(decoded).secretKey;
  } else if (decoded.length === 64) {
    // Full 64-byte secret key
    return decoded;
  } else if (decoded.length === 48) {
    // PKCS#8 encoded Ed25519 private key
    // Header is 16 bytes, followed by 32-byte seed
    const seed = decoded.slice(16);
    return nacl.sign.keyPair.fromSeed(seed).secretKey;
  } else {
    throw new Error(`Invalid key length: ${decoded.length}, expected 32, 48 (PKCS#8), or 64`);
  }
}

/**
 * Sign a narinfo fingerprint and return the signature in Nix format.
 * Format: "{keyName}:{base64Signature}"
 */
export function signNarinfo(
  privateKeyBase64: string,
  keyName: string,
  fingerprint: string
): string {
  const secretKey = decodePrivateKey(privateKeyBase64);
  const message = new TextEncoder().encode(fingerprint);
  const signature = nacl.sign.detached(message, secretKey);
  const signatureBase64 = btoa(String.fromCharCode(...signature));

  return `${keyName}:${signatureBase64}`;
}

/**
 * Derive the public key from a private key.
 * Returns in Nix format: "{keyName}:{base64PublicKey}"
 */
export function getPublicKey(privateKeyBase64: string, keyName: string): string {
  const secretKey = decodePrivateKey(privateKeyBase64);
  // Public key is the last 32 bytes of the 64-byte secret key
  const publicKey = secretKey.slice(32);
  const publicKeyBase64 = btoa(String.fromCharCode(...publicKey));

  return `${keyName}:${publicKeyBase64}`;
}

/**
 * Parse a Nix-format public key and return the raw bytes.
 * Input format: "{keyName}:{base64PublicKey}"
 */
function decodePublicKey(publicKey: string): { name: string; key: Uint8Array } {
  const colonIndex = publicKey.indexOf(':');
  if (colonIndex === -1) {
    throw new Error('Invalid public key format: missing colon');
  }
  const name = publicKey.slice(0, colonIndex);
  const base64Key = publicKey.slice(colonIndex + 1);
  const key = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));

  if (key.length !== 32) {
    throw new Error(`Invalid public key length: ${key.length}, expected 32`);
  }

  return { name, key };
}

/**
 * Verify a signature against a public key.
 * @param publicKey - Nix-format public key "{keyName}:{base64PublicKey}"
 * @param signature - Nix-format signature "{keyName}:{base64Signature}"
 * @param fingerprint - The message that was signed
 * @returns true if signature is valid, false otherwise
 */
export function verifySignature(
  publicKey: string,
  signature: string,
  fingerprint: string
): boolean {
  const { key: publicKeyBytes } = decodePublicKey(publicKey);

  // Parse signature (keyName:base64Signature)
  const sigColonIndex = signature.indexOf(':');
  if (sigColonIndex === -1) {
    throw new Error('Invalid signature format: missing colon');
  }
  const signatureBase64 = signature.slice(sigColonIndex + 1);
  const signatureBytes = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));

  const message = new TextEncoder().encode(fingerprint);

  return nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes);
}

/**
 * Build the fingerprint string for narinfo signing.
 * Format: "1;{storePath};{narHash};{narSize};{references}"
 */
export function buildFingerprint(
  storePath: string,
  narHash: string,
  narSize: number,
  references: string[]
): string {
  const refs = references.join(',');
  return `1;${storePath};${narHash};${narSize};${refs}`;
}
