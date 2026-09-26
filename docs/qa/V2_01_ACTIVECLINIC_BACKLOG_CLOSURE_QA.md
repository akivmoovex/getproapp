# V2.01 ActiveClinic Backlog Closure QA

**Task:** `V2_01_ACTIVECLINIC_BACKLOG_CLOSURE`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing`  
**Production:** **untouched** (`blessboard.com` / `activeclinic.org` remain `03a89106e2fe` · `moovex-platform-production`)

**Inputs:** `docs/qa/V2_01_MASTER_BACKLOG_AUDIT.md`, historical AC closure docs under `docs/releases/V8_AC_*` / `V8_QA_DEFECTS_PROMPT02.md` / `V8_BACKLOG.md`

**Excluded (per task):** shared infra I1/I3 · shared editor U1 (SP-T2…T5 already closed elsewhere) · facility mini-websites (unsupported)

---

## Verdict

**`V2_01_ACTIVECLINIC_BACKLOG_CLOSURE_COMPLETE`**

Historical investigation targets (booking/inquiry, duplicate registration phone, directory navigation, staff invitation + WhatsApp share-link, services/doctors catalogue, password-recovery *surface*) are **FIXED_VERIFIED** on current V8 testing — no product rewrite required. One stale catalogue regression assertion was aligned with intentional Remove-image clearing (`a6f9634a`).

**Still OPEN (not silently “closed”):**

| ID | Why still open |
| --- | --- |
| **V8-001** | Transactional SMTP for password-reset delivery (shared; needs transport config) |
| **V8-002** | `org_admin` ± `patient.create` — **product policy** required before code |
| **AC-WE-OVERFLOW** | Residual edit-mode horizontal overflow (P2 visual; not in historical BUG-001…009 set) |
| **AC-LOCATION-01/02** | P3 location admin / subdivision datasets |

No P0 failure. No patient PHI exposed in evidence. Production untouched.

---

## Environment

| Surface | Value |
| --- | --- |
| Local tip (report commit parent product tip) | `a6f9634ab4b2` |
| Hosted AC `/healthz` during smoke | `2b0cabde4a92` then `a6f9634ab4b2` · `moovex-platform-v8-testing` · `schemaCompatible=true` |
| Disposable clinic | `ac-v8-qa-mub23a6v6a6b` |
| Production | `03a89106e2fe` · **unchanged** |

Smoke artifact: `docs/qa/references/v2-01-ac-backlog-closure-smoke.json`

---

## Method

1. Reconcile master audit + `V8_QA_DEFECTS_PROMPT02` / `V8_AC_QA_BUG_CLOSURE` / `V8_BACKLOG.md`.  
2. Re-run focused local suites for historical BUG paths.  
3. Hosted smoke on disposable QA (inquiry POST, directory follow, public doctors/services, booking entry, forgot-password page, staff invite UI).  
4. Treat only **confirmed OPEN** items as code candidates — policy/SMTP items documented, not invented.  
5. Fix stale doctor-photo regression expectation only (no catalogue service rewrite).

---

## Historical investigation matrix

| Original ID | Topic | Before (master / history) | After this task | Evidence |
| --- | --- | --- | --- | --- |
| **BUG-001** | Booking / clinic inquiry submission | ALREADY_FIXED / PASS on prior tips | **FIXED_VERIFIED** | Local `activeclinic-public-booking` PASS; hosted inquiry **200 → `/contact/success`**; booking entry **200** |
| **BUG-009** | Duplicate registration phone identifiers | ALREADY_FIXED (shared identity) | **FIXED_VERIFIED** | Local `v7-shared-phone-identity` + `activeclinic-account-lifecycle` PASS; register-clinic surface **200**; no re-provision double-write this run |
| **BUG-006** | Directory → clinic detail | ALREADY_FIXED | **FIXED_VERIFIED** | Local `activeclinic-clinic-directory` PASS; hosted `/clinics` **200**, `data-ac-clinic-card-link`, follow QA clinic **200** |
| **BUG-002** | Staff invitation | ALREADY_FIXED (hosted closure PASS) | **FIXED_VERIFIED** | Local `activeclinic-staff-invitation` PASS; hosted login + `/app/staff/new?invite=1` **200** |
| **BUG-002 / MF07** | WhatsApp invitation share | Share-link / `wa.me` (no Business API) | **FIXED_VERIFIED** (by design) | `activeClinicShareLinks.js` + `staff-invite-result-content.ejs` `data-ac-invite-whatsapp`; invite **form** has copyable link flow; WhatsApp CTA on **result** after issue |
| **BUG-003** | Services management | ALREADY_FIXED | **FIXED_VERIFIED** | Local `v7-website-public-catalogue` PASS; hosted `/clinics/…/services` **200** |
| **BUG-004** | Doctor management | ALREADY_FIXED | **FIXED_VERIFIED** | Same suite PASS after test alignment; hosted `/clinics/…/doctors` **200** |
| **PASSWORD / V8-001** | Password recovery / delivery | OPEN (SMTP) | **Surface FIXED_VERIFIED · delivery OPEN** | `/forgot-password` **200**; capture/QA adapter remains; **live email delivery still V8-001** |

---

## Local regression (current tip)

```text
node --test \
  tests/v7-website-public-catalogue.test.js \
  tests/v2-ac-doctor-image-upload.test.js \
  tests/activeclinic-public-booking.test.js \
  tests/v7-shared-phone-identity.test.js \
  tests/activeclinic-clinic-directory.test.js \
  tests/activeclinic-staff-invitation.test.js
```

**Result:** **55/55 PASS** (after catalogue test alignment).

Earlier combined run also green for booking / phone / directory / invitation; only catalogue doctor-photo subtest had been failing due to a stale “empty fields keep photo” assertion that contradicted intentional Remove-image clearing (`sanitizeOverlayImageInput` → `clearImage`).

---

## Code change this task

| Commit | Scope |
| --- | --- |
| `a6f9634a` | **Test-only:** `tests/v7-website-public-catalogue.test.js` — empty image fields clear overlay; re-save with media id restores public photo |

**No** change to publishing, media ownership, theme data, HQ/branch auth, patient APIs, or facility websites.

---

## Remaining OPEN ActiveClinic-related items

| ID | Severity | Status | Blocker / next step |
| --- | --- | --- | --- |
| **V8-001** | P2 | **OPEN** | Configure transactional email transport; keep capture adapter for QA |
| **V8-002** | P3 | **OPEN** | Product decision: should `org_admin` inherit `patient.create`? Do **not** auto-grant |
| **AC-WE-OVERFLOW** | P2 | **OPEN** | AC public chrome overflow while website editing (visual) |
| **AC-LOCATION-01** | P3 | **OPEN** | Approve/merge user-added cities |
| **AC-LOCATION-02** | P3 | **OPEN** | Southern Africa subdivision dropdowns |

Skipped as out of scope / already assigned elsewhere: HOST-* infra, shared SP-T* / U1 editor polish, `AC-WEBSITE-01` projection consolidation.

---

## Hosted smoke detail (disposable)

| Check | Result |
| --- | --- |
| Inquiry POST | **PASS** → `…/contact/success` (synthetic `@example.invalid` sender) |
| Booking wizard entry | **PASS** GET `/book` |
| Directory → detail | **PASS** |
| Doctors / services public | **PASS** |
| Staff invite UI | **PASS** |
| Forgot-password page | **PASS** (delivery not claimed) |
| Patient data in logs/report | **none** |

---

## Production untouched

| Check | Result |
| --- | --- |
| `blessboard.com` `/healthz` | `03a89106e2fe` · `moovex-platform-production` |
| This task | Testing deploy of test-only commit only; **no** production write |

---

## FINAL VERDICT (repeat)

**`V2_01_ACTIVECLINIC_BACKLOG_CLOSURE_COMPLETE`**

Historical AC BUG-001/002/003/004/006/009 closed paths remain green on V8 testing. Remaining work is policy/SMTP (**V8-002**, **V8-001**) plus optional visual/location P2–P3 items — not silent reopen of fixed booking/directory/catalogue defects.
