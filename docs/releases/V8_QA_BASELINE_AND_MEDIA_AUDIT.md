# V8 QA Baseline and Media Audit (PROMPT 01)

**Verdict:** `V8_QA_BASELINE_COMPLETE`  
**Branch:** `V8` only  
**Recorded:** 2026-09-21  
**Local / origin tip audited:** `7c695b8d63b90d18a66ab574ffc61191ac5de8f7`  
**Hosted V8 SHA (live `/healthz`):** `7c695b8d63b9` · `moovex-platform-v8-testing` · `platformLine=v8` · `schemaCompatible=true`  
**Hosted V7 SHA (control):** `03a89106e2fe` · `moovex-platform-testing`  
**Shared DB:** `moovex-platform-v7` / `testing`  
**Production:** untouched  
**Runtime code changes in this prompt:** **none** (documentation only)  
**Overnight constraint:** no hosted writes, deploys, restarts, migrations, or real notifications (PROMPT 00 rule 10)

Evidence (local agent): `/tmp/v8-qa-baseline-p01/` (`img-src-scan.json`, `media-probe.json`, `focused-tests.log`, HTML snapshots).

Related prior reports (not replaced):  
[`V8_AC_QA_BUG_BASELINE.md`](./V8_AC_QA_BUG_BASELINE.md) · [`V8_AC_QA_BUG_CLOSURE.md`](./V8_AC_QA_BUG_CLOSURE.md) · [`V8_SHARED_MEDIA_RESOLUTION_FIX.md`](./V8_SHARED_MEDIA_RESOLUTION_FIX.md)

---

## Environment matrix

| Surface | Host | Live note |
|---------|------|-----------|
| V8 AC | `https://activeclinic.neuniversity.org` | healthz OK · tip SHA |
| V8 BB | `https://blessboard.neuniversity.org` | healthz OK · tip SHA |
| V7 AC | `https://activeclinic.pronline.org` | healthz OK · control |
| V7 BB | `https://blessboard.pronline.org` | healthz OK · control |
| Media root (known) | `MEDIA_STORAGE_ROOT=/home/u549637099/moovex-media` | mount healthy via `/media` |
| Public mount | `MEDIA_PUBLIC_BASE_URL=/media` · `MEDIA_PUBLIC_MOUNT_PATH=/media` | relative base; presentation derives absolute CDN host |

---

## Classification summary

| # | Issue | Classification | Overnight verification depth |
|---|-------|----------------|------------------------------|
| 1 | Booking / inquiry submission | **ALREADY_FIXED** | Public GET + local tests; submit POST not repeated (rule 10) |
| 2 | Duplicate staff phone in clinic registration | **ALREADY_FIXED** | Local BUG-009 suite; hosted write not repeated (rule 10) |
| 3 | Clinic services cannot be managed | **ALREADY_FIXED** | Public `/services` GET; staff CRUD not repeated (rule 10) |
| 4 | Doctor profiles cannot be managed | **ALREADY_FIXED** | Public `/doctors` GET; staff CRUD not repeated (rule 10) |
| 5 | Directory → clinic detail navigation | **ALREADY_FIXED** | Fresh hosted directory + card follow |
| 6 | Staff invitation and account setup | **ALREADY_FIXED** | Prior hosted PASS on ancestry; overnight invite POST deferred |
| 7 | Website section editing and publishing | **ALREADY_FIXED** | Prior hosted PASS on ancestry; overnight CMS writes deferred |
| 8 | About-section image upload | **ALREADY_FIXED** | Prior hosted PASS on ancestry; overnight upload deferred |
| — | Missing images on V8 BB + AC | **ALREADY_FIXED** | Fresh hosted HTML + image byte probes |

None of the eight items **REPRODUCED** on tip `7c695b8d`. None **BLOCKED** by infrastructure (V8 healthz OK; deployment catalogue present; sessions previously restored after `3de1d0ad`).

---

## 1. Booking / inquiry submission

| Field | Value |
|-------|-------|
| **Classification** | ALREADY_FIXED |
| **Original root cause** | Booking submit rate limiter incorrectly applied to wizard navigation POSTs (V1.3 BUG-001) |
| **Fix locus** | ActiveClinic public booking routes + rate-limit scoping (landed on V7 line; present on V8) |

**Overnight observations (read-only):**

| Check | Result |
|-------|--------|
| `GET /clinics/julflona-clinic/contact` | **200** · form present |
| `GET /clinics/julflona-clinic/book` | **200** |
| Hosted submit / inquiry POST | **not executed** (would mutate hosted data) |

**Prior hosted evidence:** closure at SHA `56a51545` — booking submit **200**, inquiry **303** → success (`V8_AC_QA_BUG_CLOSURE.md`). Tip includes that ancestry.

**Automated coverage:**

- `tests/activeclinic-public-booking.test.js` — BUG-001 navigation vs submit rate-limit; submit/idempotency
- Hosted harness (historical): `npm run activeclinic:hosted-auth-qa:testing`

**Local focused run (this prompt):** included in **45/45 PASS** cluster below.

---

## 2. Duplicate staff phone accepted in clinic registration

| Field | Value |
|-------|-------|
| **Classification** | ALREADY_FIXED |
| **Original root cause** | Unauthorized phone reuse without password-verified identity REUSE in shared identity resolution (BUG-009) |
| **Earlier V8 blocker (cleared)** | Missing `platform.deployments` row for `moovex-platform-v8-testing` caused `provision_failed` before the uniqueness gate ran |

**Overnight observations:** registration UI `GET /register-clinic` **200**. Duplicate-phone POST not repeated overnight.

**Prior hosted evidence:** second clinic with same phone → **400** duplicate message (`V8_AC_QA_BUG_CLOSURE.md`).

**Automated coverage:**

- `tests/v7-shared-phone-identity.test.js` (BUG-009 cases)
- `scripts/local/ac-registration-identity-hosted-qa.js` (V7-oriented harness)

---

## 3. Clinic services cannot be managed

| Field | Value |
|-------|-------|
| **Classification** | ALREADY_FIXED |
| **Root cause** | Not a service-table defect. Staff could not reach `/app/settings/website/catalogue?tab=services` while V8 session creation failed (missing deployment catalogue). After catalogue row + session fix, existing `appointment_service_types` + catalogue CRUD work |

**Overnight observations:** `GET /clinics/julflona-clinic/services` **200** with service-oriented content.

**Prior hosted evidence:** create/edit/hide service on disposable `ac-hqa-*` (`V8_AC_SERVICE_MANAGEMENT_QA.md`, closure).

**Automated coverage:**

- `tests/v7-website-public-catalogue.test.js` (services CRUD + tenant isolation)
- `tests/activeclinic-website-cms.test.js` (fixture visibility alignment)

---

## 4. Doctor profiles cannot be managed

| Field | Value |
|-------|-------|
| **Classification** | ALREADY_FIXED |
| **Root cause / gap** | Public catalogue lacked create/edit/delete for professional profiles without staff login; plus same V8 session blocker as services. Fixed via catalogue doctor CRUD with `platform_identity_id` left null |

**Overnight observations:** `GET /clinics/julflona-clinic/doctors` **200** with doctor-oriented content.

**Prior hosted evidence:** create/edit/unpublish/delete public-only profile (`V8_AC_DOCTOR_PROFILES_QA.md`, closure).

**Automated coverage:**

- `tests/v7-website-public-catalogue.test.js` (doctors CRUD + cross-tenant 404)

---

## 5. Clinic directory → detail navigation

| Field | Value |
|-------|-------|
| **Classification** | ALREADY_FIXED |
| **Original root cause** | Cards linked only title/CTA; logo/body clicks stayed on `/clinics` (BUG-006). Hardened to full-card `/clinics/:clinicKey` anchors |

**Overnight hosted (fresh):**

| Check | Result |
|-------|--------|
| `GET /clinics` | **200** |
| `data-ac-clinic-card-link` present | **yes** |
| Distinct detail hrefs | **10** (e.g. julflona, activeclinic-demo, …) |
| Follow julflona / activeclinic-demo / prestige-demo | **200** each |
| Legacy `<h2><a href=` pattern | **absent** |

**Automated coverage:**

- `tests/activeclinic-clinic-directory.test.js` (card href contract, unpublished exclusion)

---

## 6. Staff invitation and account setup (regression)

| Field | Value |
|-------|-------|
| **Classification** | ALREADY_FIXED |
| **Notes** | Depends on staff session + `activeclinic.staff.invite`. Overnight invite POST deferred (rule 10) |

**Overnight read-only:** `GET /login` **200**; `GET /app` **303** (auth gate). `/app/login` **404** (login is `/login`, not `/app/login`).

**Prior hosted evidence:** invite UI + POST success on closure SHA `56a51545`.

**Automated coverage:** staff invite permission / onboarding suites under ActiveClinic MF / clinic-first-login tests; shared invitation platform paths.

---

## 7. Website section editing and publishing (regression)

| Field | Value |
|-------|-------|
| **Classification** | ALREADY_FIXED |
| **Notes** | Shared website section lifecycle + product adapters. Overnight CMS writes deferred |

**Prior hosted evidence:** hub/pages/sections **200**; section save/reorder **303** (closure).

**Automated coverage:**

- `tests/shared-website-section-lifecycle.test.js` (BUG-007)
- `tests/v8-shared-website-lifecycle.test.js`
- `tests/activeclinic-website-cms.test.js`

---

## 8. About-section image upload (regression)

| Field | Value |
|-------|-------|
| **Classification** | ALREADY_FIXED |
| **Notes** | Public About editor path `/clinics/:key/about?website_edit=1&website_mode=draft` (not `/app/settings/website/about`). Overnight upload deferred |

**Prior hosted evidence:** media POST under `testing-v8/` + draft save for `about.story.image` (closure).

**Automated coverage:**

- `tests/v7-image-editor-coverage.test.js` (about.story.image key)
- Shared media / website media isolation suites

---

## Media audit — missing images on V8 products

| Field | Value |
|-------|-------|
| **Classification** | ALREADY_FIXED |
| **Historical root cause** | (1) Presentation used V8 **write** namespace `testing-v8/platform/...` for shared marketing soft-fill that lives under **`testing/platform/...`**. (2) Relative `MEDIA_PUBLIC_BASE_URL=/media` fell back to **V7** CDN host `blessboard.pronline.org` for V8 HTML |
| **Not the cause** | `MEDIA_STORAGE_ROOT=/home/u549637099/moovex-media` (mount serves existing `testing/` objects) |
| **Fix code** | `platformMarketingAssets.js` read vs write namespace; `cdnMediaPresentation.js` line-aware CDN fallback + coerce `testing-v8/platform/` → `testing/platform/` (`f52ee500`) |

### V7 vs V8 media resolution (current tip)

| Aspect | V7 (`pronline.org`) | V8 (`neuniversity.org`) |
|--------|---------------------|-------------------------|
| healthz `mediaWriteNamespace` | (V7 testing write → `testing/`) | `testing-v8` |
| Marketing **read** keys in HTML | `testing/platform/...` | `testing/platform/...` |
| CDN host in homepage HTML | `blessboard.pronline.org` | `blessboard.neuniversity.org` |
| New tenant uploads | `testing/{product}/{org}/…` | `testing-v8/{product}/{org}/…` |
| Mistaken `testing-v8/platform/...` URL | N/A | **404** (files not there); presentation coerces on generate |
| Public routes | `/media/*` via mount | same mount path `/media` |
| Media-ID resolution | Hostinger adapter + DB media rows | same shared stack; V8 may read `testing/` and write `testing-v8/` |

### Fresh hosted image probes (this prompt)

Homepage HTML emits `testing/platform/...` on **neuniversity** CDN (no `pronline`, no `testing-v8/platform`).

| URL class | Result |
|-----------|--------|
| V8 AC homepage stitch JPGs (4) | **200** `image/jpeg` |
| V8 BB homepage brand/hero/feature assets (6) | **200** image/* |
| Julflona hero via AC host `…/media/testing/platform/…/julflona-hero.jpg` | **200** |
| Same assets under `…/media/testing-v8/platform/…` | **404** (expected) |
| V7 BB logo control `pronline…/testing/platform/…` | **200** |

---

## Automated tests run this prompt

| Suite | Result |
|-------|--------|
| `tests/activeclinic-public-booking.test.js` | PASS (suite) |
| `tests/v7-shared-phone-identity.test.js` | PASS (suite) |
| `tests/activeclinic-clinic-directory.test.js` | PASS (suite) |
| `tests/v8-shared-media-resolution.test.js` | **14/14** |
| **Cluster total** | **45 tests / 0 fail** (`/tmp/v8-qa-baseline-p01/focused-tests.log`) |

Full `npm run test:v8:regression` was **not** re-run in this prompt (prior closure: 975/975). Focused cluster covers the primary bug classes for this baseline.

---

## What was not done (by design)

- No runtime code or config changes.
- No Hostinger deploy/restart.
- No migrations applied.
- No hosted POST/PUT (booking, registration, invite, CMS, media upload).
- No production or V7 branch modifications.
- No claim of a new overnight “hosted PASS” for write workflows — prior hosted PASS evidence is cited; fresh overnight hosted verification is **GET/media-only**.

---

## Final result

| Field | Value |
|-------|-------|
| Audit complete | **yes** |
| Issues reproduced on tip | **0 / 8** |
| Media missing on V8 homes | **not reproduced** |
| Runtime behavior changed | **no** |
| Verdict | **`V8_QA_BASELINE_COMPLETE`** |
