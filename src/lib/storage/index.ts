import type { BlobStorage } from "./types";
import { VercelBlobStorage } from "./vercel-blob";

export type { BlobStorage };

export function createStorage(): BlobStorage {
  // Future: switch on env var to return R2/S3 implementation
  return new VercelBlobStorage();
}
