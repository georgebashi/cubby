// src/auth.ts

/**
 * Parse an Authorization header and extract the token.
 * Supports:
 * - Bearer tokens: "Bearer <token>" or "bearer <token>"
 * - Basic auth: "Basic <base64>" -> extracts password portion
 *
 * Based on Attic's token/src/util.rs parse_authorization_header
 */
export function parseAuthorizationHeader(authorization: string): string | null {
  // Match "Bearer <token>" (case-insensitive for "Bearer")
  const bearerMatch = authorization.match(/^bearer\s+(.+)$/i);
  if (bearerMatch) {
    return bearerMatch[1];
  }

  // Match "Basic <base64>" (case-insensitive for "Basic")
  const basicMatch = authorization.match(/^basic\s+(.+)$/i);
  if (basicMatch) {
    try {
      // Decode base64 to get "username:password"
      const decoded = atob(basicMatch[1]);
      const colonIndex = decoded.indexOf(':');
      if (colonIndex === -1) {
        return null;
      }
      // Return the password portion (after the colon)
      return decoded.slice(colonIndex + 1);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Verify a token against expected read/write tokens.
 * Write token also grants read access.
 */
export function verifyToken(
  token: string,
  requiredAccess: 'read' | 'write',
  readToken: string,
  writeToken: string
): boolean {
  if (requiredAccess === 'write') {
    return token === writeToken;
  }

  // Read access: accept either read or write token
  return token === readToken || token === writeToken;
}
