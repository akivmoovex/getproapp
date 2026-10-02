# ActiveClinic V7 — Phase 9 accessibility report

WCAG 2.2 AA pass across priority ActiveClinic journeys after visual/mobile work. **High-severity accessibility blockers = 0.**

No push. No deploy. Production untouched.

Assets: **`v7-parity-13`**. Shared helper: `public/activeclinic/ac-a11y.js`.

## Verdict

| | |
|---|---|
| High blockers before | 8 |
| High blockers after | **0** |
| Medium fixed | 8 |
| Remaining (non-blocking) | 5 notes |
| Target | WCAG 2.2 AA where practical |

## Issues before

### High

| ID | Area | Detail |
|---|---|---|
| H1 | PhoneField | Country picker was not a dialog; no Tab trap; `outline: none` on options; missing `aria-required`, error/hint `aria-describedby`. |
| H2 | Forms | Clinic registration and booking patient fields did not associate validation errors with controls. |
| H3 | Contrast | Public `--acp-muted` `#6e797a` and app `--ac-text-subtle` `#94a3b8` failed AA on white. |
| H4 | Booking | Compact stepper used `aria-hidden` while visible on mobile, so current step was not announced. |
| H5 | Diagnostics | Orphan `<label>` wrapped static request/receipt text; lab result `components` lacked `for`/`id`. |
| H6 | Nav | Platform `aria-current="page"` was HTML-escaped (`&#34;`) and `/clinic/` matched register. |
| H7 | Focus | Public nav drawer and directory filter drawer had Escape close but no Tab trap. |
| H8 | Auth | Duplicate `data-ac-loading` submit handler in `ac-auth.js` could `preventDefault` and block submit. |

### Medium

| ID | Area | Detail |
|---|---|---|
| M1 | Tenant nav | Clinic header/drawer had no `aria-current`. |
| M2 | Live feedback | Many pharmacy, billing, appointment, booking, and patient POST forms had no loading announcement. |
| M3 | Skip | Auth skip said “Skip to sign-in form” on forgot/reset/activate. |
| M4 | Tables | `thead th` often lacked `scope="col"`. |
| M5 | Required | Patient security/reset/link-guest required inputs lacked `aria-required`. |
| M6 | Directory | Location filters were not grouped in a fieldset. |
| M7 | Focus CSS | App/patient/auth inputs lacked a consistent `:focus-visible` ring. |
| M8 | Progress | Patient form stepper and platform/tenant bottom nav did not mark the current item. |

### Low

| ID | Area | Detail |
|---|---|---|
| L1 | Images | Tenant logos and service icons already used `alt=""` next to visible names (decorative). |
| L2 | Status | Badges already included text; colour was not the only cue. |
| L3 | GET filters | Appointment/list GET filters do not announce busy (full page navigation). |

## Fixed

- **PhoneField / country picker** — `role="dialog"` + inner `listbox`, `aria-haspopup="dialog"`, required/error/hint association, focus trap, Escape restores focus, `:focus-visible` rings.
- **Forms** — field-level `aria-describedby` on registration and booking patient errors; `data-ac-loading` + polite live region on priority POST journeys (public register, booking, patient auth/profile/security, pharmacy, billing, appointments, tenant contact).
- **Contrast** — `--acp-muted` `#3e494a`; app `--ac-muted` / `--ac-text-subtle` `#475569`.
- **Semantics** — skip links + `main` on all four shells; `lang="en"`; platform/tenant `aria-current="page"` (unescaped); booking/patient steppers `aria-current="step"`; directory location `fieldset`; diagnostics labels corrected.
- **Keyboard / focus** — Tab trap + return focus on public drawer, filter drawer, PhoneField sheet; app drawer trap already present; visible `:focus-visible` on shells and PhoneField.
- **Tables** — `ac-a11y.js` adds `scope="col"` / `scope="row"`; Phase 8 mobile card lists remain the phone alternative.
- **Live feedback** — `role="alert"` for errors, `role="status"` for success/loading; form busy announced via `#ac-form-busy-live` / `#ac-public-live` / `#ac-patient-live`.
- **Auth** — loading handler lives only in `ac-a11y.js`; skip text is “Skip to content”.

## Remaining (not high blockers)

- Automated tests are HTML/CSS contracts plus HTTP journey smoke. They do not drive a real keyboard or screen reader.
- Some one-click inline approve/reject POST forms still omit `data-ac-loading`.
- Secondary report/detail tables may still scroll horizontally on small screens (Phase 8 note).
- Status chip contrast on non-white surfaces should be rechecked in a live browser (Phase 10).
- Account menus use native `<details>` (keyboard-accessible; not a custom modal trap).

## Keyboard journeys (structure)

| Journey | Support |
|---|---|
| Public registration | Labels, errors, PhoneField dialog, loading, skip, current nav |
| Consultation booking | Stepper announced, patient errors, loading on wizard POSTs |
| Procedure booking | Same pattern as consultation |
| Portal auth | Patient login/register/forgot/reset labelled; loading |
| Patient registration | Required + hint association |
| Appointments | Form labels, error summary, loading |
| Pharmacy | Catalogue/dispense/stock/PO loading + alerts |
| Billing | Invoice/arrangement/credit/override/void loading |

## Routes affected

`/`, `/about`, `/solutions`, `/clinics`, `/register-clinic`, `/clinics/:key/*` (tenant, booking, my-booking, patient portal), `/login` and other auth pages, `/app/*` (appointments, pharmacy, billing, diagnostics, patients, reception).

## Tests

Added `tests/activeclinic-phase9-a11y.test.js` (8 cases).

Passed: phase9, phase8, public website, public booking, patient portal. Earlier in this pass: application shell, phone standardization, Pass 8 design system.

## Next

**PHASE 10 — cross-browser / browser-console hardening.**
