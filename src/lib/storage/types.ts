export interface BlobStorage {
  upload(
    path: string,
    data: Buffer | ReadableStream,
    contentType: string
  ): Promise<{ url: string }>;
  retrieve(url: string): Promise<Buffer>;
  delete(url: string): Promise<void>;
}
