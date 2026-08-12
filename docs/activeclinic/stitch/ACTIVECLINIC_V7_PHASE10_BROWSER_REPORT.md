# ActiveClinic V7 — Phase 10 browser report

Console, network, navigation, and render sweep after overnight implementation. **Unexplained priority browser console errors = 0. Priority broken links = 0. Priority route 500s = 0.**

No push. No deploy. Production untouched.

## Verdict

| Check | After |
|---|---|
| Unexplained priority console / JS parse errors | **0** |
| Priority broken links | **0** |
| Priority route 500s | **0** |
| Cross-product CSS/JS leak | **0** |

Sweep method: HTTP smoke (supertest) + HTML duplicate-ID / asset audit + `vm.Script` parse of client JS. No live Chromium in this environment (no browser MCP). Google Fonts are third-party and were not fetched.

## Route matrix

| Surface | Representative routes | Result |
|---|---|---|
| Public | `/` `/about` `/solutions` `/clinics` `/register-clinic` | 200 |
| Juflona tenant | `/clinics/:key` about doctors services pricing location contact privacy terms patient-information | 200 |
| Booking | `/book` `/book/procedures` `/my-booking` | 200 |
| Portal | patient login/register/forgot-password; dashboard redirects when anonymous | 200 / 303 |
| Auth | `/login` `/forgot-password` | 200 |
| Patients / appointments / reception / clinical / pharmacy / diagnostics / billing / settings | hub GETs as org admin | 200 |
| Cashier | `/app/cashier` as org admin | **403** (permission `cashier.open_session` — not a 500) |
| Offline | `/app/offline` | **503** by design |
| Unknown clinic | `/clinics/no-such-clinic-xyz` | **404** by design |

## Issues before → fixed

| ID | Severity | Finding | Fix |
|---|---|---|---|
| P10-H1 | High | `GET /forgot-password` **500** — EJS `phoneCountry is not defined` after PhoneField include | `renderForgotPage` now passes `phoneCountry` + `identifier` |
| P10-H2 | High | `GET /app/billing/invoices` **500** — SQL `pr.patient_number` / `p.tenant_id` (column does not exist; number lives on `patients`) | Billing + cashier lookups use `p.patient_number` and `p.organization_id`; dropped invalid `patient_registrations` join |

## Console / network

- Client JS (`ac-a11y`, `ac-public`, `ac-patient`, `ac-auth`, `ac-phone-field`, `ac-shell-nav`) parses.
- Local CSS/JS/images referenced on smoked pages return **200**.
- Duplicate HTML `id`s on smoked pages: **0**.
- No CSP headers on the ActiveClinic foundation server (no CSP console noise).
- No failed local asset 404s on the matrix.

## Navigation

Public header/footer and Juflona header/footer/drawer links: no 404/500.

Staff primary nav (`data-ac-nav-key`) from `/app`: no 404/403/500 for visible items.

## Forms

| POST | Result |
|---|---|
| `/login` without CSRF | 403 |
| `/login` empty credentials | 401 (not 500) |
| `/register-clinic` without CSRF | 403 |
| `/register-clinic` empty | 400 |
| `/clinics/:key/contact` empty | 400 |

## Auth / RBAC

| Actor | Allowed | Denied |
|---|---|---|
| Anonymous | public/auth | `/app` → `/login` |
| Patient (anon) | portal login | `/patient` dashboard → login |
| Reception | `/app/reception` 200 | pharmacy/billing 403 |
| Clinician | `/app/clinical` 200 | billing 403 |
| Pharmacy | `/app/pharmacy` 200 | billing 403 |
| Billing | `/app/billing` 200 | pharmacy 403 |

## Product isolation

BlessBoard `views/church` and `public/church` do not reference `/activeclinic/` or `ac-*.css`. ActiveClinic views do not load `church.css`. AC pages do not include church CSS in HTML.

## Remaining (not priority blockers)

- Live browser console (Chrome/Safari/Firefox) not driven here — Phase 10 used HTTP + static parse.
- Google Fonts (`fonts.googleapis.com`) are external; a live browser with network blocked would log font failures.
- `/app/cashier` 403 for organization admin without `cashier.open_session` is expected RBAC.
- `tests/activeclinic-billing-ui-parity.test.js` still uses Mocha `describe`/`beforeAll` without `node:test` imports (Phase 11).

## Tests

Added `tests/activeclinic-phase10-browser.test.js` (7 cases).

Passed: phase10, auth stitch parity, Phase 4 billing ops.

## Next

**PHASE 11 — test-suite hardening.**
