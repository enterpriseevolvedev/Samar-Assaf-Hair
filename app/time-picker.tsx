"use client";

import { useState, useRef, useEffect, useId } from "react";

/* Stores 24h "HH:MM"; presents a friendly 12h AM/PM UI. */

type Parsed = { h24: number; m: number };

function parse(value: string): Parsed | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h24 = Number(m[1]);
  const min = Number(m[2]);
  if (h24 < 0 || h24 > 23 || min < 0 || min > 59) return null;
  return { h24, m: min };
}

function toISO(h24: number, m: number): string {
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function to12h(h24: number): { h12: number; mer: "AM" | "PM" } {
  const mer: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return { h12, mer };
}

function to24h(h12: number, mer: "AM" | "PM"): number {
  if (mer === "AM") return h12 === 12 ? 0 : h12;
  return h12 === 12 ? 12 : h12 + 12;
}

/** Friendly label, e.g. "10:30 AM". */
function formatLong(value: string): string {
  const p = parse(value);
  if (!p) return "";
  const { h12, mer } = to12h(p.h24);
  return `${h12}:${String(p.m).padStart(2, "0")} ${mer}`;
}

const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,...,55

type TimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
};

export default function TimePicker({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder = "Select a time",
  invalid,
}: TimePickerProps) {
  const parsed = parse(value);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  // Draft selection while the popover is open (committed on each change).
  const cur = parsed ? to12h(parsed.h24) : null;
  const h12 = cur?.h12 ?? null;
  const mer = cur?.mer ?? "AM";
  const minute = parsed?.m ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        onBlur?.();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        onBlur?.();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onBlur]);

  // Commit a change, filling sensible defaults for any not-yet-chosen part.
  const commit = (next: {
    h12?: number;
    minute?: number;
    mer?: "AM" | "PM";
  }) => {
    const nh12 = next.h12 ?? h12 ?? 9;
    const nmin = next.minute ?? minute ?? 0;
    const nmer = next.mer ?? mer;
    onChange(toISO(to24h(nh12, nmer), nmin));
  };

  return (
    <div className="dtp" ref={rootRef}>
      <button
        type="button"
        className={"dtp-trigger" + (invalid ? " invalid" : "")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            setOpen(true);
            onFocus?.();
          }
        }}
      >
        <span className={parsed ? "dtp-value" : "dtp-placeholder"}>
          {parsed ? formatLong(value) : placeholder}
        </span>
        <svg
          className="dtp-icon"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="8.3" stroke="currentColor" strokeWidth="1.4" />
          <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span className={"underline" + (open ? " open" : "")} />

      {open && (
        <div className="dtp-pop tmp-pop" role="dialog" aria-label="Choose time" id={popId}>
          <div className="tmp-cols">
            <div className="tmp-col" aria-label="Hour">
              <div className="tmp-col-head">Hour</div>
              <div className="tmp-scroll">
                {HOURS12.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={"tmp-cell" + (h === h12 ? " sel" : "")}
                    onClick={() => commit({ h12: h })}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            <div className="tmp-col" aria-label="Minute">
              <div className="tmp-col-head">Min</div>
              <div className="tmp-scroll">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={"tmp-cell" + (m === minute ? " sel" : "")}
                    onClick={() => commit({ minute: m })}
                  >
                    {String(m).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>

            <div className="tmp-col tmp-mer" aria-label="AM or PM">
              <div className="tmp-col-head">&nbsp;</div>
              <div className="tmp-scroll">
                {(["AM", "PM"] as const).map((mm) => (
                  <button
                    key={mm}
                    type="button"
                    className={"tmp-cell" + (mm === mer && parsed ? " sel" : "")}
                    onClick={() => commit({ mer: mm })}
                  >
                    {mm}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="dtp-foot">
            <button
              type="button"
              className="dtp-link"
              onClick={() => {
                onChange("");
                setOpen(false);
                onBlur?.();
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="dtp-link"
              onClick={() => {
                setOpen(false);
                onBlur?.();
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
