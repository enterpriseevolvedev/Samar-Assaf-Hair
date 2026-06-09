import type { EnquiryData } from "./enquiry";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function row(label: string, value: string) {
  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #e7dcc8;vertical-align:top;width:38%;font:500 11px/1.4 'Helvetica Neue',Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8d7a62;">${esc(
        label,
      )}</td>
      <td style="padding:14px 0;border-bottom:1px solid #e7dcc8;vertical-align:top;font:300 15px/1.5 'Helvetica Neue',Arial,sans-serif;color:#2c2722;">${
        value || '<span style="color:#b0a48f;">—</span>'
      }</td>
    </tr>`;
}

/** Branded HTML notification sent to the salon for each enquiry. */
export function renderEnquiryEmail(d: EnquiryData) {
  const services = d.services.length
    ? d.services.map(esc).join(", ")
    : "";

  const rows = [
    row("Name", esc(`${d.first} ${d.last}`.trim())),
    row("Email", esc(d.email)),
    row("Mobile", esc(d.mobile)),
    row("Wedding date", esc(d.date)),
    row("Hair finished by", esc(`${d.time} (AEST)`)),
    row("Preparations at", esc(d.location ?? "")),
    row("Number of people", esc(d.people)),
    row("Services", services),
    row("Touch-up service", d.touchup ? esc(d.touchup) : ""),
    row("Wedding venue", esc(d.venue ?? "")),
    row("Notes", esc(d.notes ?? "").replace(/\n/g, "<br/>")),
    row(
      "Inspiration files",
      d.attachments.length
        ? d.attachments.map((a) => esc(a.filename)).join("<br/>")
        : "",
    ),
  ].join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#efe6d6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe6d6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#faf5ec;border-radius:4px;overflow:hidden;">
        <tr>
          <td style="padding:36px 40px 28px;background:linear-gradient(160deg,#ece1cd 0%,#e3d6bd 100%);">
            <div style="font:400 11px/1.4 'Helvetica Neue',Arial,sans-serif;letter-spacing:.4em;text-transform:uppercase;color:#8d7a62;">New Bridal Enquiry</div>
            <div style="margin-top:10px;font:italic 500 30px/1 Georgia,'Times New Roman',serif;color:#2c2722;">Samar Assaf Hair</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 40px 36px;">
            <p style="margin:0 0 20px;font:300 14px/1.6 'Helvetica Neue',Arial,sans-serif;color:#8a7d6b;">A new enquiry has come through the website. Details below.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
          </td>
        </tr>
      </table>
      <div style="max-width:560px;margin:18px auto 0;font:300 12px/1.5 'Helvetica Neue',Arial,sans-serif;color:#8d7a62;text-align:center;">Sent automatically from the Samar Assaf Hair enquiry form.</div>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Plain-text fallback for clients that don't render HTML. */
export function renderEnquiryText(d: EnquiryData) {
  const line = (l: string, v: string) => `${l}: ${v || "—"}`;
  return [
    "NEW BRIDAL ENQUIRY — Samar Assaf Hair",
    "",
    line("Name", `${d.first} ${d.last}`.trim()),
    line("Email", d.email),
    line("Mobile", d.mobile),
    line("Wedding date", d.date),
    line("Hair finished by", `${d.time} (AEST)`),
    line("Preparations at", d.location ?? ""),
    line("Number of people", d.people),
    line("Services", d.services.join(", ")),
    line("Touch-up service", d.touchup ?? ""),
    line("Wedding venue", d.venue ?? ""),
    line("Notes", d.notes ?? ""),
    line(
      "Inspiration files",
      d.attachments.map((a) => a.filename).join(", "),
    ),
  ].join("\n");
}
