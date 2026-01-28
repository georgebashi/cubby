// src/narinfo.test.ts
import { describe, it, expect } from 'vitest';
import { parseNarinfo, generateNarinfo, type NarinfoData } from './narinfo.js';

describe('narinfo', () => {
  const sampleNarinfo = `StorePath: /nix/store/abc123-openssl-3.0.0
URL: nar/xyz789.nar.zst
Compression: zstd
FileHash: sha256:xyz789abcdef
FileSize: 1234567
NarHash: sha256:def456abcdef
NarSize: 2345678
References: abc123-openssl-3.0.0 def456-glibc-2.35
Sig: cache-1:base64signature==`;

  it('parses narinfo format', () => {
    const parsed = parseNarinfo(sampleNarinfo);

    expect(parsed.storePath).toBe('/nix/store/abc123-openssl-3.0.0');
    expect(parsed.url).toBe('nar/xyz789.nar.zst');
    expect(parsed.compression).toBe('zstd');
    expect(parsed.fileHash).toBe('sha256:xyz789abcdef');
    expect(parsed.fileSize).toBe(1234567);
    expect(parsed.narHash).toBe('sha256:def456abcdef');
    expect(parsed.narSize).toBe(2345678);
    expect(parsed.references).toEqual(['abc123-openssl-3.0.0', 'def456-glibc-2.35']);
    expect(parsed.sig).toBe('cache-1:base64signature==');
  });

  it('generates narinfo format', () => {
    const data: NarinfoData = {
      storePath: '/nix/store/abc123-test',
      url: 'nar/abc123.nar.zst',
      compression: 'zstd',
      fileHash: 'sha256:filehash',
      fileSize: 1000,
      narHash: 'sha256:narhash',
      narSize: 2000,
      references: ['dep1', 'dep2'],
      sig: 'key:sig',
    };

    const output = generateNarinfo(data);

    expect(output).toContain('StorePath: /nix/store/abc123-test');
    expect(output).toContain('URL: nar/abc123.nar.zst');
    expect(output).toContain('NarHash: sha256:narhash');
    expect(output).toContain('References: dep1 dep2');
    expect(output).toContain('Sig: key:sig');
  });

  it('handles empty references', () => {
    const data: NarinfoData = {
      storePath: '/nix/store/abc123-test',
      url: 'nar/abc123.nar',
      compression: 'none',
      fileHash: 'sha256:filehash',
      fileSize: 1000,
      narHash: 'sha256:narhash',
      narSize: 1000,
      references: [],
      sig: 'key:sig',
    };

    const output = generateNarinfo(data);
    expect(output).toContain('References: ');
  });

  it('generates narinfo with trailing newline', () => {
    const data: NarinfoData = {
      storePath: '/nix/store/abc123-test',
      url: 'nar/abc123.nar',
      compression: 'none',
      fileHash: 'sha256:filehash',
      fileSize: 1000,
      narHash: 'sha256:narhash',
      narSize: 1000,
      references: [],
      sig: 'key:sig',
    };

    const output = generateNarinfo(data);
    expect(output.endsWith('\n')).toBe(true);
  });

  it('outputs Sig before CA in standard Nix field order', () => {
    const data: NarinfoData = {
      storePath: '/nix/store/abc123-test',
      url: 'nar/abc123.nar',
      compression: 'none',
      fileHash: 'sha256:filehash',
      fileSize: 1000,
      narHash: 'sha256:narhash',
      narSize: 1000,
      references: [],
      sig: 'key:signature',
      ca: 'fixed:sha256:abc123',
    };

    const output = generateNarinfo(data);
    const sigIndex = output.indexOf('Sig:');
    const caIndex = output.indexOf('CA:');

    expect(sigIndex).toBeGreaterThan(-1);
    expect(caIndex).toBeGreaterThan(-1);
    expect(sigIndex).toBeLessThan(caIndex);
  });

  it('round-trips narinfo correctly', () => {
    const original: NarinfoData = {
      storePath: '/nix/store/abc123-openssl-3.0.0',
      url: 'nar/xyz789.nar.zst',
      compression: 'zstd',
      fileHash: 'sha256:xyz789abcdef',
      fileSize: 1234567,
      narHash: 'sha256:def456abcdef',
      narSize: 2345678,
      references: ['abc123-openssl-3.0.0', 'def456-glibc-2.35'],
      sig: 'cache-1:base64signature==',
      deriver: 'abc123-openssl.drv',
    };

    const generated = generateNarinfo(original);
    const parsed = parseNarinfo(generated);

    expect(parsed.storePath).toBe(original.storePath);
    expect(parsed.url).toBe(original.url);
    expect(parsed.compression).toBe(original.compression);
    expect(parsed.narHash).toBe(original.narHash);
    expect(parsed.narSize).toBe(original.narSize);
    expect(parsed.references).toEqual(original.references);
    expect(parsed.sig).toBe(original.sig);
  });
});
