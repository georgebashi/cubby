import { Hono } from "hono";
import type { Env } from "./types.js";

const app = new Hono<{ Bindings: Env }>();

// Auth middleware
const authMiddleware = (requiredToken: "read" | "write") => {
  return async (
    c: Parameters<Parameters<typeof app.use>[1]>[0],
    next: () => Promise<void>
  ) => {
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

// Public routes (no auth required for basic cache info)
app.get("/nix-cache-info", (c) => {
  return c.text("Not Implemented", 501);
});

// Read routes
app.get("/:hash.narinfo", authMiddleware("read"), (c) => {
  return c.text("Not Implemented", 501);
});

app.head("/:hash.narinfo", authMiddleware("read"), (c) => {
  return c.text("Not Implemented", 501);
});

app.get("/nar/:hash", authMiddleware("read"), (c) => {
  return c.text("Not Implemented", 501);
});

// API routes
app.get("/_api/v1/cache-config/:cache", authMiddleware("read"), (c) => {
  return c.text("Not Implemented", 501);
});

app.post("/_api/v1/get-missing-paths", authMiddleware("read"), (c) => {
  return c.text("Not Implemented", 501);
});

app.put("/_api/v1/upload-path", authMiddleware("write"), (c) => {
  return c.text("Not Implemented", 501);
});

export default app;
