# ActiveClinic V7 — Pass 9 QA Report

**Verdict:** `PASS9_QA_COMPLETE_WITH_GAPS`  
**Date:** 2026-08-11  
**Branch:** `V7`  
**SHA before:** `7aacd9c6`  
**Environment:** `DEPLOYMENT_ENV=testing` · DB identity `moovex-platform-v7` · profile `moovex-platform-testing`

## Safety

| Check | Result |
| --- | --- |
| production touched | no |
| pushed | no |
| deployed | no |
| branch switched | no |
| prior parity work preserved | yes |

## PASS9_QA_MATRIX (practical subset)

Public · Juflona · Booking · My Booking · Portal · Internal shells (≈32 routes). Full inventory not rebuilt.

## Defect register

| ID | Route | Area | Severity | Type | Found | Fixed? | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D001 | `/clinics/no-such-clinic-xyz` | JUFLONA | P3 | FUNCTIONAL | Console 404 noise on intentional 404 | N/A | Expected page status 404 |
| D002 | `/app/offline` | INTERNAL | — | — | HTTP 503 | N/A | **By design** (Pass5 offline presentation) |
| D003 | phone service | PHONE | P1 | FUNCTIONAL | `defaultCountry` ignored under deployment profile (BW→ZM) | **YES** | `phoneNumberService.parsePhoneInput`; compare test green |
| D004 | `/app/staff` test | TEST | — | TEST_STALE | `/token/` matched `ac-tokens.css` | **YES** | Tightened secret-leak assertion |
| D005 | `/clinics/.../my-booking` | MY BOOKING | P3 | ENVIRONMENT_LIMITATION | Link audit hit 429 rate limit | No | RateLimit during aggressive fetch |
| D006 | Stitch MCP spot-check | STITCH | — | ENVIRONMENT_LIMITATION | Stitch API `fetch failed` | No | MCP network failure mid-pass |

Open **P0 = 0**. Open **P1 = 0** after fix.

## Functional / security highlights

- Public + Juflona routes: 200, tokens CSS present, single H1, overflow 0 at 375–1440 on priority set.
- Booking: CSRF present; consultation → doctor step (4 radios); sticky CTA `fixed`; overflow 0.
- PhoneField: accessible name via `<label for>` (“Country”); search labeled; keyboard open/Escape close; 245 options; no overflow.
- Auth gate: unauthenticated `/app/*` → `/login`.
- QA roles: manager OK on patients/appointments/pharmacy/billing/diagnostics/departments; staff denied ops modules (403); pharmacist pharmacy OK, billing denied.
- `/app/settings/clinic-setup/departments` 200; regional 403 for clinic_manager (RBAC — expected).
- Keyboard: tenant drawer open via Enter, close via Escape.

## Automated tests (this pass)

| Command / batch | Pass | Fail | Notes |
| --- | --- | --- | --- |
| Pass5–8 + public website + directory + registration + booking + phone + shell (batch A, early) | 84 | 2 | Failures triaged → fixed |
| Phone + shell + pass8 (after fix) | 26 | 0 | |
| Booking + portal + pharmacy + RBAC batch B | 80 | 0 | |
| Product isolation (env -i mistake) | — | — | ENVIRONMENT_LIMITATION / invalid run |

### Failure triage

| Failure | Class | Disposition |
| --- | --- | --- |
| Phone `defaultCountry` BW ignored | REAL_PRODUCT_BUG | Fixed |
| Staff page `/token/` vs `ac-tokens.css` | TEST_STALE (+ Pass8 expected) | Assertion tightened |
| `/app/offline` 503 | PRE_EXISTING (by design) | Not a defect |
| Isolation DB env wipe | ENVIRONMENT_LIMITATION | Re-run with blessboard env when needed |

## Accessibility / responsive

- Priority screens: horizontal overflow **0** at 375, 390, 430, 768, 1024, 1440.
- Material a11y defects fixed: phone defaultCountry (functional/a11y of country interpretation).
- Remaining: intentional 404 console noise (P3).

## Cross-product

- ActiveClinic server on :3456 is AC-dedicated; no church CSS references to `ac-tokens` / `--acp-` found under `views/church` / `public/church`.
- BlessBoard dirt left uncommitted (unrelated).

## Stitch spot-check

- Attempted MCP against projects `17813606734422395399` and planned `12272131183982732110`.
- **Blocked:** Stitch API network failure. No score rescored. No visual regression evidence from Pass 8 cleanup in browser QA (tokens load; shells intact).

## Files changed (Pass 9)

- `src/platform/services/phoneNumberService.js` — treat call-site `defaultCountry` as clinic-level override
- `tests/activeclinic-application-shell.test.js` — secret-leak assertion not matching `ac-tokens.css`

## Next pass

**Pass 10 — parity gate / deployment readiness:** formal Stitch re-score once MCP available, remaining matrix MATCHED push, deployment checklist, no further redesign.
