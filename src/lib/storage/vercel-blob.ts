import { put, del } from "@vercel/blob";
import type { BlobStorage } from "./types";

export class VercelBlobStorage implements BlobStorage {
  async upload(
    path: string,
    data: Buffer | ReadableStream,
    contentType: string
  ): Promise<{ url: string }> {
    const blob = await put(path, data, {
      access: "public",
      contentType,
    });
    return { url: blob.url };
  }

  async retrieve(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to retrieve blob: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(url: string): Promise<void> {
    await del(url);
  }
}
