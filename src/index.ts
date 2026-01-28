// src/index.ts
import { Hono, type Context, type Next } from "hono";
import type { Env } from "./types.js";
import { handleCacheInfo } from "./handlers/cache-info.js";
import { handleCacheConfig } from "./handlers/cache-config.js";
import { handleGetMissing, type GetMissingRequest } from "./handlers/get-missing.js";
import { handleGetNarinfo, handleHeadNarinfo } from "./handlers/narinfo.js";
import { handleGetNar } from "./handlers/nar.js";
import { handleUpload, parseNarInfoHeader } from "./handlers/upload.js";
import { getPublicKey } from "./signing.js";
import { parseAuthorizationHeader, verifyToken } from "./auth.js";
import {
  parseAllowedOwners,
  type GithubOidcClaims,
  verifyGithubOidcToken,
} from "./github-oidc.js";
import { buildProjectInfo } from "./flakehub.js";

const app = new Hono<{
  Bindings: Env;
  Variables: {
    ghaClaims?: GithubOidcClaims;
  };
}>();

// Auth middleware
const authMiddleware = (requiredAccess: "read" | "write") => {
  return async (
    c: Context<{
      Bindings: Env;
      Variables: {
        ghaClaims?: GithubOidcClaims;
      };
    }>,
    next: Next
  ) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.text("Unauthorized", 401);
    }

    const token = parseAuthorizationHeader(authHeader);
    if (!token) {
      return c.text("Unauthorized", 401);
    }

    const legacyAllowed = verifyToken(
      token,
      requiredAccess,
      c.env.READ_TOKEN,
      c.env.WRITE_TOKEN
    );

    if (!legacyAllowed) {
      const allowedOwners = parseAllowedOwners(c.env.GH_ALLOWED_OWNERS);
      if (allowedOwners.size === 0) {
        return c.text("Forbidden", 403);
      }

      try {
        const claims = await verifyGithubOidcToken(token, allowedOwners);
        c.set("ghaClaims", claims);
      } catch (err) {
        console.warn("GitHub OIDC auth failed:", err);
        return c.text("Forbidden", 403);
      }
    }

    await next();
  };
};

async function requireGithubOidc(
  c: Context<{
    Bindings: Env;
    Variables: {
      ghaClaims?: GithubOidcClaims;
    };
  }>
): Promise<GithubOidcClaims | Response> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.text("Unauthorized", 401);
  }

  const token = parseAuthorizationHeader(authHeader);
  if (!token) {
    return c.text("Unauthorized", 401);
  }

  const allowedOwners = parseAllowedOwners(c.env.GH_ALLOWED_OWNERS);
  if (allowedOwners.size === 0) {
    return c.text("Forbidden", 403);
  }

  try {
    return await verifyGithubOidcToken(token, allowedOwners);
  } catch (err) {
    console.warn("GitHub OIDC auth failed:", err);
    return c.text("Forbidden", 403);
  }
}

// Public route - cache info (no auth per design doc comment, but we'll keep read auth for security)
app.get("/nix-cache-info", (c) => {
  return c.text(handleCacheInfo(c.env.CACHE_PRIORITY), 200, {
    "Content-Type": "text/x-nix-cache-info",
  });
});

// Read routes
// Use wildcard and parse the filename manually
app.get("/:filename", authMiddleware("read"), async (c) => {
  const filename = c.req.param("filename");

  // Check if it's a .narinfo request
  if (!filename.endsWith(".narinfo")) {
    return c.text("Not Found", 404);
  }

  const hash = filename.slice(0, -8); // Remove ".narinfo"
  const result = await handleGetNarinfo(c.env.BUCKET, hash);

  if (result.invalidHash) {
    return c.text("Bad Request: Invalid store path hash", 400);
  }

  if (!result.found) {
    return c.text("Not Found", 404);
  }

  return c.text(result.content!, 200, {
    "Content-Type": "text/x-nix-narinfo",
  });
});

app.on("HEAD", "/:filename", authMiddleware("read"), async (c) => {
  const filename = c.req.param("filename");

  // Check if it's a .narinfo request
  if (!filename.endsWith(".narinfo")) {
    return c.text("", 404);
  }

  const hash = filename.slice(0, -8); // Remove ".narinfo"
  const result = await handleHeadNarinfo(c.env.BUCKET, hash);

  if (result.invalidHash) {
    return c.text("", 400);
  }

  if (!result.exists) {
    return c.text("", 404);
  }

  return c.text("", 200, {
    "Content-Type": "text/x-nix-narinfo",
  });
});

app.get("/nar/:filename{.+}", authMiddleware("read"), async (c) => {
  const filename = c.req.param("filename");
  const result = await handleGetNar(c.env.BUCKET, filename);

  if (!result.found) {
    return c.text("Not Found", 404);
  }

  return new Response(result.body, {
    status: 200,
    headers: {
      "Content-Type": result.contentType!,
      "Content-Length": result.size!.toString(),
    },
  });
});

// Standard Nix binary cache PUT routes (for nix copy --to)
// These don't use Bearer auth - nix copy uses unsigned requests with client-side signing
app.put("/:filename", async (c) => {
  const filename = c.req.param("filename");

  // Check if it's a .narinfo request
  if (!filename.endsWith(".narinfo")) {
    return c.text("Not Found", 404);
  }

  const content = await c.req.text();

  await c.env.BUCKET.put(filename, content, {
    httpMetadata: { contentType: "text/x-nix-narinfo" },
  });

  return c.text("OK", 200);
});

app.put("/nar/:filename{.+}", async (c) => {
  const filename = c.req.param("filename");
  const body = c.req.raw.body;

  if (!body) {
    return c.text("Missing body", 400);
  }

  await c.env.BUCKET.put(`nar/${filename}`, body, {
    httpMetadata: { contentType: "application/x-nix-nar" },
  });

  return c.text("OK", 200);
});

// API routes
app.get("/project", async (c) => {
  const claims = await requireGithubOidc(c);
  if (claims instanceof Response) {
    return claims;
  }

  const projectName = claims.repository ?? "unknown-repo";
  const owner = claims.repository_owner ?? "unknown-owner";
  const result = await buildProjectInfo(owner, projectName);
  return c.json(result);
});

app.get("/project/:flake", async (c) => {
  const claims = await requireGithubOidc(c);
  if (claims instanceof Response) {
    return claims;
  }

  const projectName = c.req.param("flake");
  const owner = claims.repository_owner ?? "unknown-owner";
  const result = await buildProjectInfo(owner, projectName);
  return c.json(result);
});

app.get("/_api/v1/cache-config/:cache", authMiddleware("read"), (c) => {
  const url = new URL(c.req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const publicKey = getPublicKey(c.env.SIGNING_KEY, c.env.SIGNING_KEY_NAME);

  return c.json(
    handleCacheConfig({
      baseUrl,
      publicKey,
      priority: c.env.CACHE_PRIORITY,
    })
  );
});

app.post("/_api/v1/get-missing-paths", authMiddleware("read"), async (c) => {
  const body = await c.req.json<GetMissingRequest>();
  const result = await handleGetMissing(c.env.BUCKET, body.store_path_hashes);
  return c.json(result);
});

app.put("/_api/v1/upload-path", authMiddleware("write"), async (c) => {
  try {
    let narInfoJson: string;
    let narBody: ArrayBuffer;

    const narInfoHeader = c.req.header("X-Attic-Nar-Info");
    const preambleSizeHeader = c.req.header("X-Attic-Nar-Info-Preamble-Size");

    // Always read body as ArrayBuffer for R2 compatibility (needs known length)
    const fullBody = await c.req.arrayBuffer();

    if (narInfoHeader) {
      // NarInfo in header (small payloads)
      narInfoJson = narInfoHeader;
      narBody = fullBody;
    } else if (preambleSizeHeader) {
      // NarInfo as body preamble (larger payloads)
      const preambleSize = parseInt(preambleSizeHeader, 10);
      if (isNaN(preambleSize) || preambleSize <= 0) {
        return c.json({ error: "Invalid X-Attic-Nar-Info-Preamble-Size" }, 400);
      }

      const preambleBytes = new Uint8Array(fullBody.slice(0, preambleSize));
      narInfoJson = new TextDecoder().decode(preambleBytes);

      // The rest is the NAR body
      narBody = fullBody.slice(preambleSize);
    } else {
      return c.json({ error: "Missing X-Attic-Nar-Info or X-Attic-Nar-Info-Preamble-Size header" }, 400);
    }

    if (narBody.byteLength === 0) {
      return c.json({ error: "Empty request body" }, 400);
    }

    const narInfo = parseNarInfoHeader(narInfoJson);

    const result = await handleUpload({
      bucket: c.env.BUCKET,
      narInfo,
      narBody,
      signingKey: c.env.SIGNING_KEY,
      signingKeyName: c.env.SIGNING_KEY_NAME,
    });

    return c.json(result);
  } catch (err) {
    console.error("Upload error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

export default app;
