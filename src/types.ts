export interface Env {
  // R2 bucket binding
  BUCKET: R2Bucket;

  // Environment variables
  CACHE_NAME: string;
  CACHE_PRIORITY: string;

  // Secrets
  READ_TOKEN: string;
  WRITE_TOKEN: string;
  SIGNING_KEY: string;
  SIGNING_KEY_NAME: string;

  // GitHub OIDC auth
  GH_ALLOWED_OWNERS: string;
}
