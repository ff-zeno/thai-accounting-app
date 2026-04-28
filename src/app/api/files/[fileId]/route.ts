import { type NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getFileById } from "@/lib/db/queries/document-files";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { fileId } = await params;
  const file = await getFileById(orgId, fileId);
  if (!file || !file.fileUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  const result = await get(file.fileUrl, {
    access: "private",
    ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
  });

  if (!result) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (result.statusCode === 304) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: result.blob.etag,
        "Cache-Control": "private, no-cache",
      },
    });
  }

  if (result.statusCode !== 200 || !result.stream) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "X-Content-Type-Options": "nosniff",
      ETag: result.blob.etag,
      "Cache-Control": "private, no-cache",
    },
  });
}
