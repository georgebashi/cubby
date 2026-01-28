// src/store-path.test.ts
import { describe, it, expect } from 'vitest';
import {
  isValidStorePathHash,
  parseStorePath,
  extractBaseName,
  extractHashFromPath,
} from './store-path.js';

// Tests based on Attic's attic/src/nix_store/tests/mod.rs

describe('isValidStorePathHash (test_store_path_hash)', () => {
  it('accepts valid 32-character Nix base32 hash', () => {
    // From Attic test data
    expect(isValidStorePathHash('ia70ss13m22znbl8khrf2hq72qmh5drr')).toBe(true);
  });

  it('accepts real hashes from cache.nixos.org', () => {
    expect(isValidStorePathHash('563528481rvhc5kxwipjmg6rqrl95mdx')).toBe(true);
    expect(isValidStorePathHash('xcp9cav49dmsjbwdjlmkjxj10gkpx553')).toBe(true);
  });

  it('rejects hashes with invalid character "e"', () => {
    // 'e' is not in Nix base32 alphabet
    expect(isValidStorePathHash('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')).toBe(false);
  });

  it('rejects hashes with invalid character "o"', () => {
    // 'o' is not in Nix base32 alphabet
    expect(isValidStorePathHash('oooooooooooooooooooooooooooooooo')).toBe(false);
  });

  it('rejects hashes with invalid character "u"', () => {
    // 'u' is not in Nix base32 alphabet
    expect(isValidStorePathHash('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu')).toBe(false);
  });

  it('rejects hashes with invalid character "t"', () => {
    // 't' is not in Nix base32 alphabet
    expect(isValidStorePathHash('tttttttttttttttttttttttttttttttt')).toBe(false);
  });

  it('rejects uppercase letters', () => {
    // From Attic: uppercase should fail
    expect(isValidStorePathHash('IA70SS13M22ZNBL8KHRF2HQ72QMH5DRR')).toBe(false);
  });

  it('rejects hashes that are too short', () => {
    expect(isValidStorePathHash('ia70ss13m22znbl8khrf2hq')).toBe(false);
    expect(isValidStorePathHash('')).toBe(false);
  });

  it('rejects hashes that are too long', () => {
    expect(isValidStorePathHash('ia70ss13m22znbl8khrf2hq72qmh5drrx')).toBe(false);
  });
});

describe('parseStorePath (test_base_name)', () => {
  it('parses valid store path base name', () => {
    const result = parseStorePath('ia70ss13m22znbl8khrf2hq72qmh5drr-ruby-2.7.5');
    expect(result).not.toBeNull();
    expect(result!.hash).toBe('ia70ss13m22znbl8khrf2hq72qmh5drr');
    expect(result!.name).toBe('ruby-2.7.5');
  });

  it('parses base name with complex package name', () => {
    const result = parseStorePath('xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10');
    expect(result).not.toBeNull();
    expect(result!.hash).toBe('xcp9cav49dmsjbwdjlmkjxj10gkpx553');
    expect(result!.name).toBe('hello-2.10');
  });

  it('rejects base name with bad characters in hash (e)', () => {
    // 'e' is not in Nix base32
    expect(parseStorePath('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee-ruby-2.7.5')).toBeNull();
  });

  it('rejects base name with bad characters in name (!!!)', () => {
    expect(parseStorePath('ia70ss13m22znbl8khrf2hq72qmh5drr-shocking!!!')).toBeNull();
  });

  it('rejects empty name portion (hash-)', () => {
    expect(parseStorePath('ia70ss13m22znbl8khrf2hq72qmh5drr-')).toBeNull();
  });

  it('rejects no name portion (no dash)', () => {
    expect(parseStorePath('ia70ss13m22znbl8khrf2hq72qmh5drr')).toBeNull();
  });

  it('rejects too short input', () => {
    expect(parseStorePath('ia70ss13m22znbl8khrf2hq')).toBeNull();
    expect(parseStorePath('')).toBeNull();
  });

  // Note: Attic tests invalid UTF-8 in name, but JS strings are always valid UTF-16
});

describe('extractBaseName (test_to_base_name)', () => {
  it('extracts base name from standard store path', () => {
    const result = extractBaseName('/nix/store/3iq73s1p4mh4mrflj2k1whkzsimxf0l7-firefox-91.0');
    expect('baseName' in result).toBe(true);
    if ('baseName' in result) {
      expect(result.baseName).toBe('3iq73s1p4mh4mrflj2k1whkzsimxf0l7-firefox-91.0');
    }
  });

  it('handles trailing slash', () => {
    const result = extractBaseName('/gnu/store/3iq73s1p4mh4mrflj2k1whkzsimxf0l7-firefox-91.0/', '/gnu/store');
    expect('baseName' in result).toBe(true);
    if ('baseName' in result) {
      expect(result.baseName).toBe('3iq73s1p4mh4mrflj2k1whkzsimxf0l7-firefox-91.0');
    }
  });

  it('extracts base name from path with subpath', () => {
    const result = extractBaseName('/nix/store/3iq73s1p4mh4mrflj2k1whkzsimxf0l7-firefox-91.0/bin/firefox');
    expect('baseName' in result).toBe(true);
    if ('baseName' in result) {
      expect(result.baseName).toBe('3iq73s1p4mh4mrflj2k1whkzsimxf0l7-firefox-91.0');
    }
  });

  it('returns error for wrong store prefix', () => {
    // Trying to extract from /nix/store when expected is /gnu/store
    const result = extractBaseName('/nix/store/3iq73s1p4mh4mrflj2k1whkzsimxf0l7-firefox-91.0', '/gnu/store');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('not in store directory');
    }
  });

  it('returns error for store directory itself', () => {
    const result = extractBaseName('/nix/store');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('store directory itself');
    }
  });

  it('returns error for store directory with trailing slash', () => {
    const result = extractBaseName('/nix/store/');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('store directory itself');
    }
  });

  it('returns error for path that is too short', () => {
    const result = extractBaseName('/nix/store/tooshort');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('too short');
    }
  });
});

describe('extractHashFromPath', () => {
  it('extracts hash from full store path', () => {
    expect(extractHashFromPath('/nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10'))
      .toBe('xcp9cav49dmsjbwdjlmkjxj10gkpx553');
  });

  it('extracts hash from store path with subpath', () => {
    expect(extractHashFromPath('/nix/store/xcp9cav49dmsjbwdjlmkjxj10gkpx553-hello-2.10/bin/hello'))
      .toBe('xcp9cav49dmsjbwdjlmkjxj10gkpx553');
  });

  it('returns null for invalid path', () => {
    expect(extractHashFromPath('/invalid/path')).toBeNull();
    expect(extractHashFromPath('/nix/store')).toBeNull();
    expect(extractHashFromPath('/nix/store/tooshort')).toBeNull();
  });
});
