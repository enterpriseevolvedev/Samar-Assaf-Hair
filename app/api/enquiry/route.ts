import { NextResponse } from "next/server";
import { Resend } from "resend";
import { enquirySchema } from "@/lib/enquiry";
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

    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.ENQUIRY_TO;
    const from = process.env.ENQUIRY_FROM;

    if (!apiKey || !to || !from) {
      console.error(
        "Enquiry email not configured — set RESEND_API_KEY, ENQUIRY_TO and ENQUIRY_FROM.",
      );
      return NextResponse.json(
        { error: "Enquiries are temporarily unavailable. Please email us." },
        { status: 503 },
      );
    }

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: data.email,
      subject: `Bridal enquiry — ${data.first} ${data.last} · ${data.date}`,
      html: renderEnquiryEmail(data),
      text: renderEnquiryText(data),
      attachments: data.attachments.map((a) => ({
        filename: a.filename,
        content: a.content, // base64 string
        contentType: a.contentType,
      })),
    });

    if (error) {
      console.error("Resend send failed:", error);
      return NextResponse.json(
        { error: "We couldn't send your enquiry just now." },
        { status: 502 },
      );
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
