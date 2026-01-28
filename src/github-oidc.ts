// src/github-oidc.ts
export interface GithubOidcClaims {
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  repository?: string;
  repository_owner?: string;
  job_workflow_ref?: string;
  ref?: string;
  sub?: string;
}

interface JwksKey {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

interface JwksResponse {
  keys: JwksKey[];
}

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS_URL =
  "https://token.actions.githubusercontent.com/.well-known/jwks";
const GITHUB_OIDC_AUDIENCE = "api.flakehub.com";
const JWKS_TTL_MS = 60 * 60 * 1000;

let cachedJwks: JwksResponse | null = null;
let cachedJwksAt = 0;

function decodeBase64Url(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  if (typeof atob === "function") {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  return Uint8Array.from(Buffer.from(padded, "base64"));
}

function parseJwtPart<T>(part: string): T {
  const bytes = decodeBase64Url(part);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as T;
}

function isAudienceValid(aud: string | string[]): boolean {
  if (Array.isArray(aud)) {
    return aud.includes(GITHUB_OIDC_AUDIENCE);
  }
  return aud === GITHUB_OIDC_AUDIENCE;
}

async function fetchJwks(force: boolean): Promise<JwksResponse> {
  const now = Date.now();
  if (!force && cachedJwks && now - cachedJwksAt < JWKS_TTL_MS) {
    return cachedJwks;
  }

  const res = await fetch(GITHUB_OIDC_JWKS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch GitHub OIDC JWKS: ${res.status}`);
  }

  const jwks = (await res.json()) as JwksResponse;
  cachedJwks = jwks;
  cachedJwksAt = now;
  return jwks;
}

async function importRsaKey(key: JwksKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    key,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"]
  );
}

export async function verifyGithubOidcToken(
  token: string,
  allowedOwners: Set<string>
): Promise<GithubOidcClaims> {
  if (!token) {
    throw new Error("Missing token");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed JWT");
  }

  const header = parseJwtPart<{ alg?: string; kid?: string }>(parts[0]);
  if (header.alg !== "RS256") {
    throw new Error("Unsupported JWT alg");
  }
  if (!header.kid) {
    throw new Error("Missing JWT kid");
  }

  const claims = parseJwtPart<GithubOidcClaims>(parts[1]);
  if (claims.iss !== GITHUB_OIDC_ISSUER) {
    throw new Error("Invalid JWT issuer");
  }
  if (!isAudienceValid(claims.aud)) {
    throw new Error("Invalid JWT audience");
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) {
    throw new Error("JWT expired");
  }
  if (claims.nbf && claims.nbf > now) {
    throw new Error("JWT not yet valid");
  }

  if (!claims.repository_owner) {
    throw new Error("Missing repository owner claim");
  }

  const owner = claims.repository_owner.toLowerCase();
  if (!allowedOwners.has(owner)) {
    throw new Error("Repository owner not allowed");
  }

  const jwks = await fetchJwks(false);
  let jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    const refreshed = await fetchJwks(true);
    jwk = refreshed.keys.find((key) => key.kid === header.kid);
  }
  if (!jwk) {
    throw new Error("JWT key not found");
  }

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = decodeBase64Url(parts[2]);
  const key = await importRsaKey(jwk);
  const isValid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    signature,
    data
  );

  if (!isValid) {
    throw new Error("Invalid JWT signature");
  }

  return claims;
}

export function parseAllowedOwners(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function resetJwksCacheForTesting(): void {
  cachedJwks = null;
  cachedJwksAt = 0;
}
