// src/github-oidc.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseAllowedOwners,
  resetJwksCacheForTesting,
  verifyGithubOidcToken,
} from "./github-oidc.js";

function base64UrlEncode(input: Uint8Array): string {
  const base64 =
    typeof btoa === "function"
      ? btoa(String.fromCharCode(...input))
      : Buffer.from(input).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signJwt(
  payload: Record<string, unknown>,
  privateKey: CryptoKey,
  kid: string
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT", kid };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const headerB64 = base64UrlEncode(headerBytes);
  const payloadB64 = base64UrlEncode(payloadBytes);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    data
  );
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

describe("github-oidc", () => {
  const originalFetch = globalThis.fetch;
  let jwks: {
    keys: Array<JsonWebKey & { kid: string; use: string; alg: string }>;
  };
  let privateKey: CryptoKey;
  const kid = "test-kid";

  beforeEach(async () => {
    resetJwksCacheForTesting();
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"]
    );

    if (!("privateKey" in keyPair) || !("publicKey" in keyPair)) {
      throw new Error("Expected CryptoKeyPair from generateKey");
    }

    privateKey = keyPair.privateKey;
    const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    jwks = {
      keys: [
        {
          ...(publicJwk as JsonWebKey),
          kid,
          use: "sig",
          alg: "RS256",
        },
      ],
    };

    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify(jwks), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
  });

  it("accepts allowed owners", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(
      {
        iss: "https://token.actions.githubusercontent.com",
        aud: "api.flakehub.com",
        exp: now + 60,
        repository_owner: "ExampleOrg",
      },
      privateKey,
      kid
    );

    const claims = await verifyGithubOidcToken(
      token,
      parseAllowedOwners("exampleorg")
    );
    expect(claims.repository_owner).toBe("ExampleOrg");
  });

  it("rejects disallowed owners", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(
      {
        iss: "https://token.actions.githubusercontent.com",
        aud: "api.flakehub.com",
        exp: now + 60,
        repository_owner: "BadOrg",
      },
      privateKey,
      kid
    );

    await expect(
      verifyGithubOidcToken(token, parseAllowedOwners("goodorg"))
    ).rejects.toThrow("Repository owner not allowed");
  });

  it("rejects expired tokens", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(
      {
        iss: "https://token.actions.githubusercontent.com",
        aud: "api.flakehub.com",
        exp: now - 10,
        repository_owner: "ExampleOrg",
      },
      privateKey,
      kid
    );

    await expect(
      verifyGithubOidcToken(token, parseAllowedOwners("exampleorg"))
    ).rejects.toThrow("JWT expired");
  });

  it("caches JWKS", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(
      {
        iss: "https://token.actions.githubusercontent.com",
        aud: "api.flakehub.com",
        exp: now + 60,
        repository_owner: "ExampleOrg",
      },
      privateKey,
      kid
    );

    const allowed = parseAllowedOwners("exampleorg");
    await verifyGithubOidcToken(token, allowed);
    await verifyGithubOidcToken(token, allowed);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("parses owners allowlist", () => {
    const set = parseAllowedOwners("Foo, bar , ,BAZ");
    expect(set.has("foo")).toBe(true);
    expect(set.has("bar")).toBe(true);
    expect(set.has("baz")).toBe(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
});
