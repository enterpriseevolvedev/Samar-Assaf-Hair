import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ACCEPTED_FILE_TYPES, MAX_TOTAL_BYTES } from "@/lib/enquiry";

/**
 * Mints short-lived client upload tokens so the browser can stream inspiration
 * files straight to Vercel Blob — the bytes never pass through this function,
 * which sidesteps Vercel's 4.5 MB request-body limit. The blobs are ephemeral:
 * `/api/enquiry` fetches them onto the email and deletes them right after.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...ACCEPTED_FILE_TYPES],
        // Single cap: no one file may exceed the whole upload budget.
        maximumSizeInBytes: MAX_TOTAL_BYTES,
        // Unguessable filenames; combined with deletion-after-send this keeps
        // the public blob effectively private for its brief lifetime.
        addRandomSuffix: true,
      }),
      // No onUploadCompleted: the enquiry route owns the blob lifecycle (fetch
      // + delete), and the callback can't resolve a URL on localhost anyway.
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Blob upload token error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
