# AC-V6-S02 — Dashboard and Shared Shell Stitch Parity

**Stage:** AC-V6-S02  
**Date:** 2026-08-03  
**Verdict:** `ACTIVECLINIC_V6_S02_DASHBOARD_SHELL_PARTIAL`

Stitch visuals sourced from downloaded HTML/PNG via `list_screens` (not hotlinked). MCP `get_screen` remained unavailable.

---

## Exact Stitch screens

| Exact Stitch name | Stitch ID | Form factor | Route | Status |
|---|---|---|---|---|
| P01 – Shared Application Shell – Desktop | `01b9125044634434b60223746b815b25` | Desktop | `/app/*` chrome | **PARTIAL** |
| P01 – Navigation Drawer – Mobile | `9f55cec7eb884dbebc2e01c6fb0fe58e` | Mobile | drawer chrome | **PARTIAL** |
| P01 – Dashboard – Desktop | `390032bf54ca44ee851673a4800f9af3` | Desktop | `GET /app` | **PARTIAL** (foundation data) |
| P01 – Dashboard – Mobile | `8be466d48814446ab8bb087baacc6ec9` | Mobile | `GET /app` | **PARTIAL** |
| Access Restricted | `8731b06bbfa747e98e05372c9aafb3e9` | Desktop | denied states | **PARTIAL** |
| P01 – Shared States / Shared Loading/Error/Offline | inventory | — | chrome states | **PARTIAL** (restricted/expired; no fake loading skeleton) |
| Application Shell / Dashboard / Drawer unprefixed | duplicates | — | — | **DUPLICATE** — not targeted |

---

## Routes

- `GET /app` — dashboard loader + shell  
- `GET/POST /app/select-organization`, `GET/POST /app/select-facility` — unchanged secure flows, shell chrome refined  
- Foundation pages `/app/facilities`, `/app/staff`, `/app/access`, `/app/settings` — shell integration only  
- `POST /logout` — CSRF POST unchanged  

No clinical routes added.

---

## Shell architecture

One canonical shell: `views/activeclinic/layouts/app-shell.ejs` + `partials/sidebar.ejs` + `ac-app.css` + `ac-shell-nav.js`.

- Desktop sidebar + desktop header account menu  
- Mobile top bar + drawer (Escape, backdrop, focus trap, close control)  
- Single navigation registry: `activeClinicNavigation.js` (permission-filtered; foundation items only)  
- Organization / facility switchers via links to existing secure pages (server-validated)  

Clinical Stitch nav groups (Patients, Appointments, Pharmacy, Lab, Billing, …) are **intentionally deferred** and not rendered.

---

## Dashboard data policy

Loader: `loadActiveClinicDashboardHome.js`

**Shown (real):** welcome/context, active facility count, active staff count, pending invitation count, setup checklist, permission-aware quick actions.

**Omitted unsupported Stitch KPIs:** patients today/waiting, consultations, appointments, reception queue, pharmacy alerts, billing/invoices, register-patient / book-appointment actions.

---

## Intentional differences

1. Foundation nav only (not clinical IA from Stitch).  
2. No global patient search (would imply unimplemented clinical search).  
3. No notification bell with fake unread state.  
4. KPI cards replaced with infrastructure summaries.  
5. Hanken Grotesk (product) vs Stitch Inter/Jakarta.  
6. Navy shell primary aligned to Stitch; teal retained as `--ac-teal` token for continuity.  
7. Pure SSR — no decorative full-page loading skeleton.

---

## Accessibility / security

Skip link, landmarks, one H1, `aria-current`, drawer focus management, CSRF on logout/context POSTs, server-side org/facility validation, no open redirects, AC cookie isolation, permission hiding ≠ authorization.

---

## Tests

```bash
node --test \
  tests/activeclinic-dashboard-shell-parity.test.js \
  tests/activeclinic-application-shell.test.js \
  tests/activeclinic-auth-stitch-parity.test.js \
  tests/activeclinic-authentication-foundation.test.js \
  tests/activeclinic-account-lifecycle.test.js \
  tests/activeclinic-product-isolation.test.js \
  tests/activeclinic-session-principal.test.js
```

**61 pass / 0 fail.** Visual score N/A (no golden tooling).

---

## Remaining gaps

- Pixel-perfect sidebar density vs Stitch clinical IA  
- Facility/staff list page content parity (later waves)  
- Shared offline state not productized  
- Collapse/compact sidebar control not in live shell (Stitch may show it; not required for foundation)

---

## Gate for AC-V6-S03

**Open.** Recommend **AC-V6-S03 — Facilities List and Facility Detail** (or Facility Selection and Management) per AC-V6-11 waves.
