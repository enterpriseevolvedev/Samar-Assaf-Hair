# Samar Assaf Hair — Bridal Enquiry

A single-page bridal hair enquiry site for Samar Assaf Hair. Brides submit their
wedding details and the enquiry is emailed to the salon.

Built with **Next.js 16** (App Router) + **React 19** + **TypeScript**, form
handling via **react-hook-form** + **zod**, and email delivery via **Resend**.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
pnpm dev                     # http://localhost:3000
```

## Environment variables

Set these in `.env.local` (see `.env.example`):

| Variable         | Description                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| `RESEND_API_KEY` | Resend API key (https://resend.com/api-keys)                             |
| `ENQUIRY_TO`     | Salon inbox that receives enquiries, e.g. `hello@samarassafhair.com.au`  |
| `ENQUIRY_FROM`   | Verified Resend sender, e.g. `Samar Assaf Hair <enquiries@yourdomain>`   |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Public contact email shown to brides in the left panel (not a secret) |

The bride's email is set as the `reply-to` so the salon can reply directly.
Until the variables are set the form returns a friendly "temporarily
unavailable" message instead of sending.

## Scripts

| Command      | Description                          |
| ------------ | ------------------------------------ |
| `pnpm dev`   | Local dev (loads `.env.local`, Turbopack) |
| `pnpm build` | Production build                     |
| `pnpm start` | Run the production build             |
| `pnpm lint`  | ESLint                               |

## Structure

```
app/
  layout.tsx          Fonts (Cormorant Garamond, Jost) + metadata
  page.tsx            Renders the enquiry form
  enquiry-form.tsx    Client component — the form UI
  enquiry-form.css    Form styles (ported from the design)
  globals.css         Design tokens (:root) + base styles
  api/enquiry/route.ts  Validates + sends the enquiry email
lib/
  enquiry.ts          Shared zod schema + types
  enquiry-email.ts    Branded HTML/text email templates
```
