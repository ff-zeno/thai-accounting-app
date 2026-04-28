import { head, get } from "@vercel/blob";

export interface PrivateBlobHead {
  size: number;
  contentType: string;
}

export interface PrivateBlobBytes {
  bytes: Uint8Array;
  contentType: string;
}

// HEAD equivalent for a private Vercel Blob URL. Uses the SDK's authenticated
// head() call — a plain fetch against a private blob URL returns 403.
export async function headPrivateBlob(
  url: string
): Promise<PrivateBlobHead | null> {
  try {
    const result = await head(url);
    return { size: result.size, contentType: result.contentType };
  } catch {
    return null;
  }
}

// Fetch a private blob's bytes server-side. Private blobs can't be fetched
// by external clients (AI model providers, the browser), so consumers that
// need the file content must materialize it through this helper and inline
// the bytes into their request (e.g. as an `image`/`file` part for the AI SDK).
export async function fetchPrivateBlobBytes(
  url: string
): Promise<PrivateBlobBytes> {
  const result = await get(url, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Failed to fetch private blob: ${url}`);
  }
  const arrayBuffer = await new Response(result.stream).arrayBuffer();
  return {
    bytes: new Uint8Array(arrayBuffer),
    contentType: result.blob.contentType || "application/octet-stream",
  };
}
