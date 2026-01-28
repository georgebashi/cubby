// src/flakehub.ts
export interface FlakeHubProjectInfo {
  organization_uuid_v7: string;
  project_uuid_v7: string;
}

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function uuidToBytes(uuid: string): Uint8Array {
  const normalized = uuid.replace(/-/g, "");
  if (normalized.length !== 32) {
    throw new Error("Invalid UUID");
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export async function uuidV5(name: string, namespace: string): Promise<string> {
  const namespaceBytes = uuidToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const combined = new Uint8Array(namespaceBytes.length + nameBytes.length);
  combined.set(namespaceBytes, 0);
  combined.set(nameBytes, namespaceBytes.length);

  const digest = await crypto.subtle.digest("SHA-1", combined);
  const hash = new Uint8Array(digest).slice(0, 16);

  // Set version 5 (0101xxxx)
  hash[6] = (hash[6] & 0x0f) | 0x50;
  // Set RFC 4122 variant (10xxxxxx)
  hash[8] = (hash[8] & 0x3f) | 0x80;

  return bytesToUuid(hash);
}

export async function buildProjectInfo(
  owner: string,
  projectName: string
): Promise<FlakeHubProjectInfo> {
  const orgUuid = await uuidV5(owner, UUID_NAMESPACE_DNS);
  const projectUuid = await uuidV5(projectName, orgUuid);
  return {
    organization_uuid_v7: orgUuid,
    project_uuid_v7: projectUuid,
  };
}
