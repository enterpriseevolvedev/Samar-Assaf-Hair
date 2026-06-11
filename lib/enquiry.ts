import { z } from "zod";

export const SERVICES = [
  "Bridal Styling",
  "Colour",
  "Agi One / Keratin",
  "Hair Extensions",
  "Trial Run",
] as const;

export type Service = (typeof SERVICES)[number];

/* ---------- inspiration attachments ---------- */

export const MAX_FILES = 10;
// One cap only — total bytes across all files. No per-file limit; a single
// file may use the whole budget.
// Files are emailed as attachments, so the total must clear common inbox caps.
// Base64 encoding inflates the payload ~37%, so 15 MB of raw bytes becomes
// ~20 MB on the wire — comfortably under both Resend's 40 MB cap and Gmail's
// 25 MB receive limit, so enquiries won't bounce.
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024; // 15 MB total upload
export const ACCEPTED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

/** Hostname suffix shared by every Vercel Blob URL (public and private stores). */
const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

/**
 * Guards against SSRF: the enquiry route fetches and deletes attachment URLs,
 * so we only ever accept URLs that point at our own Vercel Blob store.
 */
export function isBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/**
 * An attachment reference carried in the JSON payload. The file bytes live in
 * Vercel Blob (uploaded directly from the browser); we only pass the URL so the
 * request body stays tiny and well under Vercel's 4.5 MB function limit.
 */
export const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(150),
  size: z.number().int().nonnegative(),
  /** Temporary Vercel Blob URL — fetched, attached, then deleted after send. */
  url: z.string().url().refine(isBlobUrl, "Invalid attachment URL"),
});

export type EnquiryAttachment = z.infer<typeof attachmentSchema>;

/**
 * Validation rules mirror the original prototype exactly:
 * required first/last/people, valid email, mobile with >= 8 digits,
 * required date + completion time. Everything else is optional.
 */
export const enquirySchema = z.object({
  first: z.string().trim().min(1, "Please enter your first name"),
  last: z.string().trim().min(1, "Please enter your last name"),
  email: z
    .string()
    .trim()
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter a valid email address"),
  mobile: z
    .string()
    .refine(
      (val) => val.replace(/\D/g, "").length >= 8,
      "Enter a valid mobile number",
    ),
  date: z.string().min(1, "Please select your wedding date"),
  time: z.string().min(1, "Please add a completion time"),
  location: z.string().optional().default(""),
  people: z.string().trim().min(1, "Let us know who needs styling"),
  touchup: z.enum(["Yes", "No"]).optional(),
  venue: z.string().optional().default(""),
  services: z.array(z.enum(SERVICES)).default([]),
  notes: z.string().optional().default(""),
  attachments: z
    .array(attachmentSchema)
    .max(MAX_FILES, `Please attach at most ${MAX_FILES} files`)
    .default([])
    .refine(
      (files) => files.reduce((sum, f) => sum + f.size, 0) <= MAX_TOTAL_BYTES,
      "Your files are too large in total",
    )
    .refine(
      (files) =>
        files.every((f) =>
          (ACCEPTED_FILE_TYPES as readonly string[]).includes(f.contentType),
        ),
      "Only images and PDFs can be attached",
    ),
});

export type EnquiryInput = z.input<typeof enquirySchema>;
export type EnquiryData = z.output<typeof enquirySchema>;
