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

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB total upload (well under Resend's 40 MB)
export const ACCEPTED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

/** An attachment carried in the JSON payload — file bytes as base64. */
export const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(150),
  /** base64-encoded file content (no data: prefix). */
  content: z.string().min(1),
  size: z.number().int().nonnegative(),
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
      (files) => files.every((f) => f.size <= MAX_FILE_BYTES),
      "One of your files is too large",
    )
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
