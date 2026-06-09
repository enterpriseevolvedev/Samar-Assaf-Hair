"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  SERVICES,
  enquirySchema,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  ACCEPTED_FILE_TYPES,
  type EnquiryInput,
  type Service,
} from "@/lib/enquiry";
import "./enquiry-form.css";

/** A locally-held file plus its object-URL preview (for images). */
type PickedFile = {
  id: string;
  file: File;
  preview: string | null;
};

const ACCEPT_ATTR = ACCEPTED_FILE_TYPES.join(",");

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Reads a File into a base64 string (no data: prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Public-facing contact address shown to brides in the left panel. This is the
// address the salon wants displayed — distinct from the server-only ENQUIRY_TO
// inbox the form actually delivers to.
const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "hello@samarassafhair.com.au";

const BLANK: EnquiryInput = {
  first: "",
  last: "",
  email: "",
  mobile: "",
  date: "",
  time: "",
  location: "",
  people: "",
  touchup: undefined,
  venue: "",
  services: [],
  notes: "",
};

export default function EnquiryForm() {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<EnquiryInput>({
    resolver: zodResolver(enquirySchema),
    defaultValues: BLANK,
    mode: "onSubmit",
  });

  const [sent, setSent] = useState(false);
  const [sentName, setSentName] = useState("");
  const [formError, setFormError] = useState("");
  const [focused, setFocused] = useState<string>("");

  const [files, setFiles] = useState<PickedFile[]>([]);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const touchup = watch("touchup");

  // Revoke object URLs on unmount so image previews don't leak memory.
  useEffect(() => {
    return () => {
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    };
    // Intentionally run only on unmount — per-add revocation is handled in removeFile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      setFileError("");
      const list = Array.from(incoming);
      setFiles((prev) => {
        const next = [...prev];
        let totalBytes = prev.reduce((s, f) => s + f.file.size, 0);
        for (const file of list) {
          if (next.length >= MAX_FILES) {
            setFileError(`You can attach up to ${MAX_FILES} files.`);
            break;
          }
          if (
            !(ACCEPTED_FILE_TYPES as readonly string[]).includes(file.type)
          ) {
            setFileError("Only images and PDFs can be attached.");
            continue;
          }
          if (file.size > MAX_FILE_BYTES) {
            setFileError(
              `"${file.name}" is larger than ${fmtSize(MAX_FILE_BYTES)}.`,
            );
            continue;
          }
          if (totalBytes + file.size > MAX_TOTAL_BYTES) {
            setFileError(
              `Attachments must total under ${fmtSize(MAX_TOTAL_BYTES)}.`,
            );
            continue;
          }
          // Skip exact duplicates (same name + size).
          if (
            next.some(
              (p) => p.file.name === file.name && p.file.size === file.size,
            )
          ) {
            continue;
          }
          totalBytes += file.size;
          next.push({
            id: `${file.name}-${file.size}-${file.lastModified}`,
            file,
            preview: file.type.startsWith("image/")
              ? URL.createObjectURL(file)
              : null,
          });
        }
        return next;
      });
    },
    [],
  );

  const removeFile = (id: string) => {
    setFileError("");
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const clearFiles = () => {
    setFiles((prev) => {
      prev.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      return [];
    });
    setFileError("");
  };

  // Reproduces the prototype's focus-driven animated underline. RHF's register
  // gives us onFocus/onBlur via the returned props, so we layer our tracking on.
  const fieldProps = (name: keyof EnquiryInput) => {
    const reg = register(name);
    return {
      ...reg,
      onFocus: () => setFocused(name),
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFocused("");
        return reg.onBlur(e);
      },
    };
  };

  const wrapCls = (name: keyof EnquiryInput) =>
    "field" +
    (errors[name] ? " invalid" : "") +
    (focused === name ? " focused" : "");

  const onValid = async (data: EnquiryInput) => {
    setFormError("");
    try {
      const attachments = await Promise.all(
        files.map(async (f) => ({
          filename: f.file.name,
          contentType: f.file.type,
          content: await fileToBase64(f.file),
          size: f.file.size,
        })),
      );

      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, attachments }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Something went wrong");
      }
      setSentName(data.first || "lovely");
      setSent(true);
      clearFiles();
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      setFormError(
        err instanceof Error
          ? `We couldn't send your enquiry — ${err.message}. Please try again or email us directly.`
          : "We couldn't send your enquiry. Please try again.",
      );
    }
  };

  const onInvalid = () => {
    const firstError = Object.keys(errors)[0] as keyof EnquiryInput | undefined;
    if (firstError) setFocus(firstError);
  };

  return (
    <div className="wrap">
      <main className="panel">
        <div className="form-inner">
          <header className="brandhead">
            <div className="brand-over">Bridal Hair · Australia</div>
            <div className="brand-name">Samar Assaf Hair</div>
          </header>

          {sent ? (
            <div className="done">
              <div className="seal">✓</div>
              <h2>Thank you, {sentName}.</h2>
              <p>
                Your bridal enquiry has landed safely with us. Samar will
                personally review your day and reply within 48 hours with
                availability and a tailored quote.
              </p>
              <p style={{ color: "var(--accent-deep)" }}>
                We can&rsquo;t wait to be a part of your wedding.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onValid, onInvalid)} noValidate>
              <p className="eyebrow">Bridal Enquiry</p>
              <h1 className="title">
                Tell us about
                <br />
                your wedding day.
              </h1>
              <p className="lede">
                A few details so we can craft the perfect bridal hair experience
                for you and your party. Every field marked required helps us hold
                your date.
              </p>

              <div className="section-tag">Your details</div>

              <div className="grid2">
                <div className={wrapCls("first")}>
                  <label>
                    First Name <span className="req">Required</span>
                  </label>
                  <input placeholder="Charlotte" {...fieldProps("first")} />
                  <span className="underline" />
                  {errors.first && (
                    <div className="err">{errors.first.message}</div>
                  )}
                </div>
                <div className={wrapCls("last")}>
                  <label>
                    Last Name <span className="req">Required</span>
                  </label>
                  <input placeholder="Rose" {...fieldProps("last")} />
                  <span className="underline" />
                  {errors.last && (
                    <div className="err">{errors.last.message}</div>
                  )}
                </div>
              </div>

              <div className={wrapCls("email")}>
                <label>
                  Email <span className="req">Required</span>
                </label>
                <input
                  type="email"
                  placeholder="charlotte@email.com"
                  {...fieldProps("email")}
                />
                <span className="underline" />
                {errors.email && (
                  <div className="err">{errors.email.message}</div>
                )}
              </div>

              <div className={wrapCls("mobile")}>
                <label>
                  Mobile Number <span className="req">Required</span>
                </label>
                <input
                  type="tel"
                  placeholder="0400 000 000"
                  {...fieldProps("mobile")}
                />
                <span className="underline" />
                {errors.mobile && (
                  <div className="err">{errors.mobile.message}</div>
                )}
              </div>

              <div className="section-tag">The big day</div>

              <div className="grid2">
                <div className={wrapCls("date")}>
                  <label>
                    Wedding Date <span className="req">Required</span>
                  </label>
                  <input type="date" {...fieldProps("date")} />
                  <span className="underline" />
                  {errors.date && (
                    <div className="err">{errors.date.message}</div>
                  )}
                </div>
                <div className={wrapCls("time")}>
                  <label>
                    Hair Finished By <span className="req">Required</span>
                  </label>
                  <input type="time" {...fieldProps("time")} />
                  <span className="underline" />
                  {errors.time && (
                    <div className="err">{errors.time.message}</div>
                  )}
                </div>
              </div>
              <div
                className="hint"
                style={{ marginTop: "-18px", marginBottom: "30px" }}
              >
                Hairstyle completion time — please ask your photographer for the
                best timing. Times are in Australian Eastern Time (AEST).
              </div>

              <div className={wrapCls("location")}>
                <label>Location of Bridal Preparations</label>
                <input
                  placeholder="Hotel, address or suburb"
                  {...fieldProps("location")}
                />
                <span className="underline" />
              </div>

              <div className={wrapCls("people")}>
                <label>
                  Number of People <span className="req">Required</span>
                </label>
                <div className="hint">
                  Please specify — e.g. bride, 2× bridesmaids, 1× mum.
                </div>
                <input
                  placeholder="Bride + 3 bridesmaids + mum"
                  {...fieldProps("people")}
                />
                <span className="underline" />
                {errors.people && (
                  <div className="err">{errors.people.message}</div>
                )}
              </div>

              <div className="section-tag">Services</div>

              <Controller
                control={control}
                name="services"
                render={({ field }) => {
                  const selected = field.value ?? [];
                  const toggle = (s: Service) =>
                    field.onChange(
                      selected.includes(s)
                        ? selected.filter((x) => x !== s)
                        : [...selected, s],
                    );
                  return (
                    <div className="field" style={{ marginBottom: "34px" }}>
                      <label>Which services are you interested in?</label>
                      <div className="chips">
                        {SERVICES.map((s) => (
                          <button
                            type="button"
                            key={s}
                            className={"chip" + (selected.includes(s) ? " on" : "")}
                            onClick={() => toggle(s)}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />

              <Controller
                control={control}
                name="touchup"
                render={({ field }) => (
                  <div
                    className="field"
                    style={{
                      marginBottom: field.value === "Yes" ? "14px" : "30px",
                    }}
                  >
                    <label>
                      Do you require a hair change or touch-up service?
                    </label>
                    <div className="seg">
                      <button
                        type="button"
                        className={field.value === "Yes" ? "on" : ""}
                        onClick={() => field.onChange("Yes")}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={field.value === "No" ? "on" : ""}
                        onClick={() => field.onChange("No")}
                      >
                        No
                      </button>
                    </div>
                  </div>
                )}
              />

              <div
                className="reveal"
                style={{
                  maxHeight: touchup === "Yes" ? "180px" : "0",
                  opacity: touchup === "Yes" ? 1 : 0,
                  marginBottom: touchup === "Yes" ? "30px" : "0",
                }}
              >
                <div className={wrapCls("venue")}>
                  <label>Wedding Venue</label>
                  <div className="hint">
                    If so, please specify your reception / ceremony venue for
                    touch-ups.
                  </div>
                  <input
                    placeholder="Venue name & suburb"
                    {...fieldProps("venue")}
                  />
                  <span className="underline" />
                </div>
              </div>

              <div className={wrapCls("notes")}>
                <label>Anything else we should know?</label>
                <textarea
                  placeholder="Inspiration, hair length & type, accessories, veils…"
                  {...fieldProps("notes")}
                />
                <span className="underline" />
              </div>

              <div className="section-tag">Your Inspiration</div>

              <div className="field" style={{ marginBottom: "34px" }}>
                <div className="hint" style={{ margin: "0 0 14px" }}>
                  Saved a few looks or a Pinterest board? Share them here. And if
                  not, don&rsquo;t worry — we&rsquo;ll dream it up together x
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  multiple
                  className="file-input-hidden"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />

                <div
                  className={"dropzone" + (dragging ? " dragover" : "")}
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
                  }}
                >
                  <div className="dropzone-plus">+</div>
                  <div className="dropzone-title">Add a File</div>
                  <div className="dropzone-sub">
                    Tap to browse or drop images here
                  </div>
                </div>

                {files.length > 0 && (
                  <ul className="filelist">
                    {files.map((f) => (
                      <li key={f.id} className="fileitem">
                        <div className="filethumb">
                          {f.preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.preview} alt={f.file.name} />
                          ) : (
                            <span className="filethumb-doc">PDF</span>
                          )}
                        </div>
                        <div className="filemeta">
                          <span className="filename">{f.file.name}</span>
                          <span className="filesize">
                            {fmtSize(f.file.size)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="fileremove"
                          aria-label={`Remove ${f.file.name}`}
                          onClick={() => removeFile(f.id)}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {fileError && <div className="err">{fileError}</div>}
              </div>

              <button type="submit" className="submit" disabled={isSubmitting}>
                {isSubmitting ? "Sending…" : "Send Enquiry"}
              </button>
              {formError ? (
                <p className="form-error">{formError}</p>
              ) : (
                <p className="footnote">
                  We reply to every bride within 48 hours.
                </p>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
