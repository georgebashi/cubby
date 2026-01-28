// src/auth.test.ts
import { describe, it, expect } from 'vitest';
import { parseAuthorizationHeader, verifyToken } from './auth.js';

// Tests based on Attic's token/src/util.rs test_parse_authorization_header
describe('parseAuthorizationHeader', () => {
  describe('Basic auth', () => {
    it('extracts password from Basic auth header', () => {
      // "someuser:somepass" base64 encoded is "c29tZXVzZXI6c29tZXBhc3M="
      expect(parseAuthorizationHeader('Basic c29tZXVzZXI6c29tZXBhc3M=')).toBe('somepass');
    });

    it('is case-insensitive for "Basic" keyword', () => {
      // From Attic: baSIC should work too
      expect(parseAuthorizationHeader('baSIC c29tZXVzZXI6c29tZXBhc3M=')).toBe('somepass');
      expect(parseAuthorizationHeader('BASIC c29tZXVzZXI6c29tZXBhc3M=')).toBe('somepass');
      expect(parseAuthorizationHeader('basic c29tZXVzZXI6c29tZXBhc3M=')).toBe('somepass');
    });

    it('returns null for invalid base64', () => {
      expect(parseAuthorizationHeader('Basic not-valid-base64!!!')).toBe(null);
    });

    it('returns null for base64 without colon separator', () => {
      // "nopassword" (no colon) base64 encoded
      expect(parseAuthorizationHeader('Basic bm9wYXNzd29yZA==')).toBe(null);
    });

    it('handles empty password', () => {
      // "user:" base64 encoded is "dXNlcjo="
      expect(parseAuthorizationHeader('Basic dXNlcjo=')).toBe('');
    });

    it('handles password with colon', () => {
      // "user:pass:word" base64 encoded is "dXNlcjpwYXNzOndvcmQ="
      expect(parseAuthorizationHeader('Basic dXNlcjpwYXNzOndvcmQ=')).toBe('pass:word');
    });
  });

  describe('Bearer auth', () => {
    it('extracts token from Bearer auth header', () => {
      expect(parseAuthorizationHeader('bearer some-token')).toBe('some-token');
    });

    it('is case-insensitive for "Bearer" keyword', () => {
      expect(parseAuthorizationHeader('Bearer some-token')).toBe('some-token');
      expect(parseAuthorizationHeader('BEARER some-token')).toBe('some-token');
      expect(parseAuthorizationHeader('BeArEr some-token')).toBe('some-token');
    });

    it('preserves full token value', () => {
      const longToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      expect(parseAuthorizationHeader(`Bearer ${longToken}`)).toBe(longToken);
    });

    it('handles token with special characters', () => {
      expect(parseAuthorizationHeader('Bearer abc+def/ghi=')).toBe('abc+def/ghi=');
    });
  });

  describe('invalid headers', () => {
    it('returns null for empty string', () => {
      expect(parseAuthorizationHeader('')).toBe(null);
    });

    it('returns null for unknown auth type', () => {
      expect(parseAuthorizationHeader('Digest abc123')).toBe(null);
      expect(parseAuthorizationHeader('Unknown token')).toBe(null);
    });

    it('returns null for malformed header', () => {
      expect(parseAuthorizationHeader('Bearer')).toBe(null);
      expect(parseAuthorizationHeader('Basic')).toBe(null);
    });
  });
});

describe('verifyToken', () => {
  const readToken = 'read-token-123';
  const writeToken = 'write-token-456';

  describe('read access', () => {
    it('accepts read token for read access', () => {
      expect(verifyToken(readToken, 'read', readToken, writeToken)).toBe(true);
    });

    it('accepts write token for read access (write implies read)', () => {
      expect(verifyToken(writeToken, 'read', readToken, writeToken)).toBe(true);
    });

    it('rejects invalid token for read access', () => {
      expect(verifyToken('invalid', 'read', readToken, writeToken)).toBe(false);
    });
  });

  describe('write access', () => {
    it('accepts write token for write access', () => {
      expect(verifyToken(writeToken, 'write', readToken, writeToken)).toBe(true);
    });

    it('rejects read token for write access', () => {
      expect(verifyToken(readToken, 'write', readToken, writeToken)).toBe(false);
    });

    it('rejects invalid token for write access', () => {
      expect(verifyToken('invalid', 'write', readToken, writeToken)).toBe(false);
    });
  });
});
