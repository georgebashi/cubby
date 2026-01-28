// src/flakehub.test.ts
import { describe, expect, it } from "vitest";
import { buildProjectInfo, uuidV5 } from "./flakehub.js";

describe("flakehub project helpers", () => {
  it("generates RFC 4122 UUIDv5 values", async () => {
    const dnsNamespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const uuid = await uuidV5("example.org", dnsNamespace);
    expect(uuid).toBe("aad03681-8b63-5304-89e0-8ca8f49461b5");
  });

  it("builds deterministic project info", async () => {
    const info = await buildProjectInfo(
      "example-owner",
      "example-flake"
    );
    expect(info.project_uuid_v7).toBeDefined();
    expect(info.organization_uuid_v7).toBeDefined();
  });
});
