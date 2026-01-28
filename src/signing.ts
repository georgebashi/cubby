// src/signing.ts
import nacl from 'tweetnacl';

/**
 * Decode a base64-encoded Ed25519 private key.
 * Supports raw 32-byte seeds, 64-byte keypairs, and PKCS#8 encoded keys.
 */
function decodePrivateKey(base64Key: string): Uint8Array {
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
