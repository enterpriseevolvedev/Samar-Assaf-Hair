"use client";

import { useState, useRef, useEffect, useId } from "react";

/* ---------- date helpers (work in YYYY-MM-DD, no timezone drift) ---------- */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Parse "YYYY-MM-DD" into a local Date (midnight). Returns null if empty/invalid. */
function parseISO(value: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Long, friendly label for the trigger, e.g. "Sat, 13 June 2026". */
function formatLong(d: Date): string {
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${wd}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Disallow dates before this ISO date (inclusive of the date itself). */
  min?: string;
  invalid?: boolean;
};

export default function DatePicker({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder = "Select a date",
  min,
  invalid,
}: DatePickerProps) {
  const selected = parseISO(value);
  const minDate = min ? parseISO(min) : null;

  const [open, setOpen] = useState(false);
  // The month currently shown in the grid (first of month).
  const [view, setView] = useState<Date>(() => {
    const base = selected ?? minDate ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  // Close on outside click / Escape.
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

  const openPicker = () => {
    if (selected) setView(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setOpen(true);
    onFocus?.();
  };

  const isDisabled = (d: Date) => (minDate ? d < minDate : false);

  // Build the 6-row grid: leading days from prev month, this month, trailing.
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < firstDow; i++) {
    const date = new Date(year, month, 1 - (firstDow - i));
    cells.push({ date, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1].date;
    cells.push({
      date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
      inMonth: false,
    });
    if (cells.length >= 42) break;
  }

  const today = new Date();

  const pick = (d: Date) => {
    if (isDisabled(d)) return;
    onChange(toISO(d));
    setOpen(false);
    onBlur?.();
  };

  return (
    <div className="dtp" ref={rootRef}>
      <button
        type="button"
        className={"dtp-trigger" + (invalid ? " invalid" : "")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <span className={selected ? "dtp-value" : "dtp-placeholder"}>
          {selected ? formatLong(selected) : placeholder}
        </span>
        <svg
          className="dtp-icon"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <rect x="3" y="4.5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3 9h18M8 2.5v4M16 2.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <span className={"underline" + (open ? " open" : "")} />

      {open && (
        <div className="dtp-pop" role="dialog" aria-label="Choose date" id={popId}>
          <div className="dtp-head">
            <div className="dtp-title">
              {MONTHS[month]} {year}
            </div>
            <div className="dtp-nav">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setView(new Date(year, month - 1, 1))}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setView(new Date(year, month + 1, 1))}
              >
                ›
              </button>
            </div>
          </div>

          <div className="dtp-grid dtp-dow">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="dtp-dow-cell">
                {w}
              </span>
            ))}
          </div>

          <div className="dtp-grid">
            {cells.map(({ date, inMonth }, i) => {
              const disabled = isDisabled(date);
              const isSel = selected && sameDay(date, selected);
              const isToday = sameDay(date, today);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  className={
                    "dtp-day" +
                    (inMonth ? "" : " out") +
                    (isSel ? " sel" : "") +
                    (isToday && !isSel ? " today" : "")
                  }
                  onClick={() => pick(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
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
                const t = new Date();
                if (isDisabled(t)) return;
                pick(t);
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
