import { NextResponse } from "next/server";
import { Resend } from "resend";
import { del } from "@vercel/blob";
import { enquirySchema, isBlobUrl } from "@/lib/enquiry";
import { renderEnquiryEmail, renderEnquiryText } from "@/lib/enquiry-email";

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    if (!json) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const parsed = enquirySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Please check the form and try again.",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }
    const data = parsed.data;
    console.log(`[enquiry] received — ${data.attachments.length} attachment(s)`);

    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.ENQUIRY_TO;
    const from = process.env.ENQUIRY_FROM;
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

    if (!apiKey || !to || !from) {
      console.error(
        "Enquiry email not configured — set RESEND_API_KEY, ENQUIRY_TO and ENQUIRY_FROM.",
      );
      return NextResponse.json(
        { error: "Enquiries are temporarily unavailable. Please email us." },
        { status: 503 },
      );
    }

    // The store is private, so reading the blobs back requires the token.
    if (data.attachments.length && !blobToken) {
      console.error(
        "BLOB_READ_WRITE_TOKEN missing — cannot read private blob attachments.",
      );
      return NextResponse.json(
        { error: "Enquiries are temporarily unavailable. Please email us." },
        { status: 503 },
      );
    }

    // Pull each blob's bytes back so Resend can attach them. The 4.5 MB request
    // limit only applies to the *incoming* body, not to these outbound fetches.
    let attachments: { filename: string; content: Buffer; contentType: string }[];
    try {
      attachments = await Promise.all(
        data.attachments.map(async (a) => {
          // Belt-and-braces: the schema already rejects non-Blob URLs, but never
          // fetch a URL we don't own.
          if (!isBlobUrl(a.url)) throw new Error(`Refusing to fetch ${a.url}`);
          console.log(`[enquiry] fetching blob ${a.filename}…`);
          // Private store: authenticate the read with the blob token.
          const res = await fetch(a.url, {
            headers: { Authorization: `Bearer ${blobToken}` },
          });
          if (!res.ok) {
            throw new Error(`Failed to fetch attachment (${res.status})`);
          }
          const content = Buffer.from(await res.arrayBuffer());
          console.log(`[enquiry] fetched ${a.filename} (${content.length} bytes)`);
          return {
            filename: a.filename,
            content,
            contentType: a.contentType,
          };
        }),
      );
    } catch (err) {
      console.error("Attachment fetch failed:", err);
      return NextResponse.json(
        { error: "We couldn't process your attachments. Please try again." },
        { status: 502 },
      );
    }

    console.log("[enquiry] sending via Resend…");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: data.email,
      subject: `Bridal enquiry — ${data.first} ${data.last} · ${data.date}`,
      html: renderEnquiryEmail(data),
      text: renderEnquiryText(data),
      attachments,
    });

    if (error) {
      console.error("Resend send failed:", error);
      return NextResponse.json(
        { error: "We couldn't send your enquiry just now." },
        { status: 502 },
      );
    }

    console.log("[enquiry] Resend OK — cleaning up blobs");
    // Files are ephemeral: now that the email is sent, delete the blobs so
    // nothing persists. A cleanup failure must not fail the request.
    if (data.attachments.length) {
      await Promise.allSettled(
        data.attachments.map((a) => del(a.url)),
      ).then((results) => {
        const failed = results.filter((r) => r.status === "rejected");
        if (failed.length) {
          console.error(`Blob cleanup: ${failed.length} delete(s) failed`, failed);
        }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Enquiry route error:", err);
    return NextResponse.json(
      { error: "Something went wrong on our end." },
      { status: 500 },
    );
  }
}
