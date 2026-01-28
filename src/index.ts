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

const app = new Hono<{ Bindings: Env }>();

// Auth middleware
const authMiddleware = (requiredToken: "read" | "write") => {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.text("Unauthorized", 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const expectedToken =
      requiredToken === "write" ? c.env.WRITE_TOKEN : c.env.READ_TOKEN;

    // Write token also grants read access
    if (token !== expectedToken && token !== c.env.WRITE_TOKEN) {
      return c.text("Forbidden", 403);
    }

    await next();
  };
};

// Public route - cache info (no auth per design doc comment, but we'll keep read auth for security)
app.get("/nix-cache-info", (c) => {
  return c.text(handleCacheInfo(c.env.CACHE_PRIORITY));
});

// Read routes
app.get("/:hash.narinfo", authMiddleware("read"), async (c) => {
  const hash = c.req.param("hash");
  const result = await handleGetNarinfo(c.env.BUCKET, hash);

  if (!result.found) {
    return c.text("Not Found", 404);
  }

  return c.text(result.content!, 200, {
    "Content-Type": "text/x-nix-narinfo",
  });
});

app.on("HEAD", "/:hash.narinfo", authMiddleware("read"), async (c) => {
  const hash = c.req.param("hash");
  const exists = await handleHeadNarinfo(c.env.BUCKET, hash);

  if (!exists) {
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

// API routes
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
  const narInfoHeader = c.req.header("X-Attic-Nar-Info");
  if (!narInfoHeader) {
    return c.json({ error: "Missing X-Attic-Nar-Info header" }, 400);
  }

  const narInfo = parseNarInfoHeader(narInfoHeader);
  const narBody = c.req.raw.body;

  if (!narBody) {
    return c.json({ error: "Missing request body" }, 400);
  }

  const result = await handleUpload({
    bucket: c.env.BUCKET,
    narInfo,
    narBody,
    signingKey: c.env.SIGNING_KEY,
    signingKeyName: c.env.SIGNING_KEY_NAME,
  });

  return c.json(result);
});

export default app;
