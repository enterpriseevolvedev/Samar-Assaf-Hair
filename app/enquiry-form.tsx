"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { upload } from "@vercel/blob/client";
import {
  SERVICES,
  enquirySchema,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  ACCEPTED_FILE_TYPES,
  type EnquiryInput,
  type Service,
} from "@/lib/enquiry";
import DatePicker from "./date-picker";
import TimePicker from "./time-picker";
import "./enquiry-form.css";

/** Today's date as YYYY-MM-DD, so brides can't pick a past wedding date. */
function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

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
      // Upload files straight to Vercel Blob from the browser — the bytes never
      // pass through our API, so Vercel's 4.5 MB request limit doesn't apply. We
      // send only the resulting URLs; the enquiry route attaches and deletes them.
      let attachments: {
        filename: string;
        contentType: string;
        size: number;
        url: string;
      }[];
      try {
        attachments = await Promise.all(
          files.map(async (f) => {
            console.log(`[upload] starting ${f.file.name} (${f.file.size} bytes)…`);
            const blob = await upload(f.file.name, f.file, {
              access: "public",
              handleUploadUrl: "/api/upload",
              contentType: f.file.type,
            });
            console.log(`[upload] done ${f.file.name} → ${blob.url}`);
            return {
              filename: f.file.name,
              contentType: f.file.type,
              size: f.file.size,
              url: blob.url,
            };
          }),
        );
      } catch (err) {
        console.error("[upload] failed:", err);
        setFormError(
          "We couldn't upload your files — please check your connection and try again.",
        );
        return;
      }

      console.log(`[upload] all done — posting enquiry (${attachments.length} attachment(s))`);
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
                <div className={"field" + (errors.date ? " invalid" : "")}>
                  <label>
                    Wedding Date <span className="req">Required</span>
                  </label>
                  <Controller
                    control={control}
                    name="date"
                    render={({ field }) => (
                      <DatePicker
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        min={todayISO()}
                        placeholder="Select your date"
                        invalid={!!errors.date}
                      />
                    )}
                  />
                  {errors.date && (
                    <div className="err">{errors.date.message}</div>
                  )}
                </div>
                <div className={"field" + (errors.time ? " invalid" : "")}>
                  <label>
                    Hair Finished By <span className="req">Required</span>
                  </label>
                  <Controller
                    control={control}
                    name="time"
                    render={({ field }) => (
                      <TimePicker
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        placeholder="Select a time"
                        invalid={!!errors.time}
                      />
                    )}
                  />
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
                  <div className="dropzone-plus" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M9 3.5v11M3.5 9h11"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <div className="dropzone-title">Add a File</div>
                  <div className="dropzone-sub">
                    Tap to browse or drop files here · up to {MAX_FILES} files,{" "}
                    {Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB total
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
