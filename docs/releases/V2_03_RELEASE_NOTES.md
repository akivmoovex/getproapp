# Version 2.03 Release Notes

**Runtime catalog:** `src/platform/release-notes/releaseNotesCatalog.js` (version `2.03`)  
**About / version metadata:** `src/platform/build/applicationBuildInfo.js` (`VERSION_BASE_V8` / `PRODUCT_VERSION_V8` = `2.03`)  
**Rule:** Customer-facing claims below are limited to **IMPLEMENTED_AND_VERIFIED** and accurately labeled **IMPLEMENTED_WITH_KNOWN_GAP** items from V2.03 QA evidence.

---

## BlessBoard

### What's New

- Product **Version 2.03** on About (separate Git build SHA).
- Continuity release after shared platform consolidation: church website edit, draft/media, unpublished-change review, and publish remain available for HQ and branch scopes.

### Improvements

- Role and permission checks continue through catalogue assignments; unauthorized website publish remains denied.
- Hosted critical paths for public pages, login/registration, HQ portal, editor, CMS, media, and publish review verified on the V2.03 testing candidate.

### Known Limitations

- Production is **not** promoted to 2.03 by this packet.
- Some legacy stub routes may still show “not yet available.”
- Justified dual-write / classic CMS compatibility bridges remain for continuity (internal; not a new customer feature).
- V2.02-only remediations that landed **after** the V2.03 application candidate (announcement document upload, sermon date validation, Universal Image Editor parity fixes) are **not** claimed here.

---

## ActiveClinic

### What's New

- **Clinic operations foundation (Batch 1):** setup checklist, services catalogue/editor, practitioners and availability, appointment calendar/create/lifecycle, booking-request triage, patients and consents, reception check-in and live queue, clinical worklist/encounter/follow-up, invoices and cashier payments/receipts, performance summaries, and import/export data jobs.
- **Operational shell (Batch 2):** staff dashboard and navigation shell; pharmacy and diagnostics queues; facilities and departments administration; stronger facility-scoped operational workflows.
- **Clinical and portal leaves (Batch 3):**
  - Vitals recording, prescription orders, and referrals worklists.
  - **Rooms & Spaces** catalogue (**MVP** — inventory only).
  - **Clinical Documents** (**MVP** — draft/final lifecycle; **no private binary attachments**).
  - **Visit Summary** clinician release + patient-safe snapshot (**MVP** — **no PDF**); completing an encounter does **not** auto-release.
  - Patient portal: my bookings, booking detail, conditional visit summaries, invoices, and profile.

### Improvements

- Staff navigation and operational queues are aligned on a shared clinic shell (desktop and mobile companion).
- Tenant, facility, and patient isolation hardened and hosted-verified for critical Batch routes.
- Earlier Clinical Documents deny/not-found response hang resolved on the testing lineage before the current candidate.

### Known Limitations

- Production is **not** promoted to 2.03 by this packet.
- **Clinical Documents:** private binary attachments / download / e-sign are deferred.
- **Visit Summary:** PDF / private storage, re-release versioning, and automatic patient instructions are deferred.
- **Rooms & Spaces:** no occupancy engine, room scheduling, bed management, IoT, or equipment inventory.
- No dedicated **radiology suite** as a named product capability (diagnostics queues only).
- Public clinic websites may remain unavailable until publish; **facility public websites** remain **not supported**.

---

## Shared Platform

Meaningful user-visible shared improvements only:

- Shared GetPro platform consolidation on V10 strengthens common permissions, website-editor helpers, media ownership rules, and operational list chrome used by **both** BlessBoard and ActiveClinic — without merging church and clinical product screens.
- Critical hosted verification on testing confirms session/CSRF protections and isolation deny paths for both products.
- Architecture residual debt and justified DB compatibility remain; they are not marketed as customer features.

Internal-only consolidation (dependency direction, Finder cleanup, publication orchestration internals, dual-write retention, etc.) is **not** listed as customer release bullets.

---

## Release Evidence

| Field | Value |
|-------|--------|
| Branch | `V10` |
| **V2.03 application candidate SHA** | `039ad22193c97759ce9bd5ca73fe56b0e38886ab` |
| **Hosted testing SHA** | `039ad22193c97759ce9bd5ca73fe56b0e38886ab` (`039ad22193c9`) |
| Prior product freeze SHA (superseded for QA01–QA14) | `b8c18c3ded9892aa318ae6e029600aa34ff4941b` |
| QA / freeze status | `V2_03_READY_FOR_MANUAL_QA` (QA14) · hosted critical `V203_HOSTED_CRITICAL_VERIFICATION_PASS` |
| Migration ceiling (testing) | platform/**043** · blessboard/**118** · activeclinic/**042** |
| Production status | **UNTOUCHED** — not deployed / not certified by this packet |

### Authoritative sources

- `docs/qa/V2_03_QA_TEST_HANDOFF.md`
- `docs/qa/V2_03_QA_BASELINE.md`
- `docs/qa/V2_03_HOSTED_SHA_ALIGNMENT.md`
- `docs/qa/V2_03_HOSTED_CRITICAL_VERIFICATION.md`
- `docs/qa/V2_03_TEST_EVIDENCE_LEDGER.md`
- `docs/qa/V2_03_QA_RELEASE_HANDOFF.md` (AC feature statuses; SHA superseded by QA01–QA14)
- `docs/qa/V2_03_BB_REGRESSION_TEST_READINESS.md`
- `docs/qa/V2_03_AC_BATCH1_TEST_READINESS.md`
- `docs/qa/V2_03_AC_BATCH2_TEST_READINESS.md`
- `docs/qa/V2_03_AC_BATCH3_TEST_READINESS.md`
- `docs/qa/V2_03_NEW_SCREENS_FINAL_RECONCILIATION.md`

### Evidence matrix (compact)

| Product | Release-note item | Source | Status | Public |
|---------|-------------------|--------|--------|--------|
| BB | About 2.03 | applicationBuildInfo + this packet | IMPLEMENTED_AND_VERIFIED (local render) | YES |
| BB | Website/admin continuity | QA10 + QA13B + QA14 | IMPLEMENTED_AND_VERIFIED | YES |
| BB | Catalogue permission continuity | QA10 + QA06 + QA14 | IMPLEMENTED_AND_VERIFIED | YES |
| AC | Batch 1 ops/appointments/reception/clinical/billing | QA07 + Batch1 PASS docs + QA handoff | IMPLEMENTED_AND_VERIFIED | YES |
| AC | Batch 2 shell/pharmacy/diagnostics/facilities | QA08 + RBAC audit + QA handoff | IMPLEMENTED_AND_VERIFIED | YES |
| AC | Vitals / Rx / referrals | QA09 + B3 pass docs | IMPLEMENTED_AND_VERIFIED | YES |
| AC | Rooms & Spaces MVP | QA handoff + reconciliation + QA09 | IMPLEMENTED_WITH_KNOWN_GAP | YES |
| AC | Clinical Documents MVP | QA handoff + reconciliation + QA09 | IMPLEMENTED_WITH_KNOWN_GAP | YES |
| AC | Visit Summary MVP | QA handoff + reconciliation + QA09 | IMPLEMENTED_WITH_KNOWN_GAP | YES |
| AC | Patient portal bookings/invoices/profile | QA09 + portal pass docs | IMPLEMENTED_AND_VERIFIED | YES |
| SHARED | Platform consolidation benefit | QA14 + PL14 + PLATFORM_SHARED_FOUNDATION | IMPLEMENTED_AND_VERIFIED | YES |
| SHARED | Isolation hardening | QA13B + QA06 + B2 RBAC | IMPLEMENTED_AND_VERIFIED | YES |
| INTERNAL | Dual-write / bridge retention | QA10 / QA14 tech debt | INTERNAL_TECHNICAL | NO |
| DEFERRED | ACN18 binaries / ACP05 PDF / ACN27 occupancy | QA09 + BACKLOG + handoff gaps | DEFERRED | Limitations only |
| NOT_V2_03 | BB announcement upload / sermon date / UIE V2.02 fixes | commits after `039ad221` | NOT_V2_03 | NO |

### Excluded from public notes

**UNVERIFIED / not claimed**

- Pixel-perfect Stitch parity for every Batch screen (manual remaining)
- Production RELEASED status
- Full radiology product suite

**V2_02_ONLY (post-candidate; excluded)**

- BlessBoard announcement document upload remediation
- BlessBoard sermon date validation remediation
- Universal Image Editor parity remediation from `c73dd9b2` (after candidate `039ad221`)
