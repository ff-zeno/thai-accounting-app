import { put, del, get } from "@vercel/blob";
import type { BlobStorage } from "./types";

export class VercelBlobStorage implements BlobStorage {
  async upload(
    path: string,
    data: Buffer | ReadableStream,
    contentType: string
  ): Promise<{ url: string }> {
    const blob = await put(path, data, {
      access: "private",
      contentType,
    });
    return { url: blob.url };
  }

  async retrieve(url: string): Promise<Buffer> {
    const result = await get(url, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error(`Failed to retrieve blob: ${url}`);
    }
    const arrayBuffer = await new Response(result.stream).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(url: string): Promise<void> {
    await del(url);
  }
}
