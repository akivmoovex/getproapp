# V8 ActiveClinic QA Bug Baseline

**Recorded:** 2026-09-20T18:25:00Z (approx.)  
**Branch:** `V8` only  
**Verdict:** `V8_AC_QA_BASELINE_COMPLETE`  
**Hosted AC SHA:** `6c82c972237c` (`moovex-platform-v8-testing` / `testing` / `platformLine=v8`)  
**Local / origin/V8 at baseline run:** `6c82c972237ca9ebaea4989eb90661e6ce1de29c`  
**Source mapping:** ActiveClinic V1.3 QA items (20 September 2026 notes + BUG-001/003/004/006/009 open set restated for V8)  
**Production:** untouched  
**Code changes in this task:** none (documentation only)

Evidence directory (local agent): `/tmp/v8-ac-qa-baseline/`.

---

## Environment matrix

| Surface | Host | SHA / note |
|---------|------|------------|
| V8 AC QA | `https://activeclinic.neuniversity.org` | `6c82c972237c` · healthz OK · schemaCompatible |
| V8 BB QA | `https://blessboard.neuniversity.org` | not exercised in this AC baseline |
| V7 AC QA | `https://activeclinic.pronline.org` | `03a89106e2fe` · demo login **works** (control) |
| Shared DB | `moovex-platform-v7` / `testing` | used by V7 + V8 |
| Production AC | `https://activeclinic.org` | untouched |

---

## Cross-cutting blocker (affects auth-gated items)

**Finding:** `platform.deployments` has **no row** for `moovex-platform-v8-testing` (and no `neuniversity.org` canonical domain row). V8 `/healthz` still reports `deploymentCode=moovex-platform-v8-testing`.

**Impact observed on hosted V8:**

1. Staff login with known-good credentials returns **HTTP 401** and never sets `moovex_platform_v8_testing_sid`.  
   - Control: same demo admin password verifies in DB (`bcrypt` match) and logs into **V7** successfully.  
   - Likely path: `authenticateActiveClinicIdentity` → `createDeploymentSession` → `DEPLOYMENT_NOT_FOUND` / failed session write, surfaced as generic login failure.
2. Hosted clinic registration shows “Clinic created” with `?review=1`, but applications land as `status=provision_failed`, `last_provision_stage=organization`, `last_provision_error=provision_failure` (catalogue deployment lookup during provision).
3. Disposable DB-provisioned clinic (`ac-hqa-*` via testing fixture using `moovex-platform-testing`) also cannot log into **V8** (401). Public booking against that fixture during hosted-auth QA still passed.

Until the V8 deployment catalogue row exists (and registration/session use it consistently), authenticated AC workflows cannot be certified on hosted V8.

---

## Status summary

| # | Item (V1.3 / QA map) | Hosted V8 status |
|---|----------------------|------------------|
| 1 | Booking / inquiry submission (BUG-001) | **Already Fixed** |
| 2 | Duplicate staff phone during clinic registration (BUG-009) | **Blocked** |
| 3 | Clinic service CRUD and publishing (BUG-003) | **Blocked** |
| 4 | Doctor profile CRUD and publishing (BUG-004) | **Partial** |
| 5 | Directory-to-clinic navigation (BUG-006) | **Already Fixed** |
| 6 | Staff invitation and account setup (BUG-002) | **Blocked** |
| 7 | Website text and image+text sections (BUG-007) | **Blocked** |
| 8 | About-section image upload (BUG-008) | **Blocked** |

---

## 1. Booking / inquiry submission

**Status:** Already Fixed  

**Routes:**

- Inquiry: `GET/POST /clinics/:clinicKey/contact` → success `/clinics/:clinicKey/contact/success`  
- Apex inquiry: `GET/POST /contact` → `/contact/success`  
- Booking wizard: `/clinics/:clinicKey/book` → `…/doctor` → `…/slot` → `…/patient` → `…/review` → **`POST /clinics/:clinicKey/book/submit`**

**Reproduction steps (V8):**

1. Open `https://activeclinic.neuniversity.org/clinics/julflona-clinic/contact`.  
2. POST `senderName`, `senderEmail`, `phone_country=ZM`, `phone_national`, `message` + CSRF.  
3. Walk consultation booking wizard on julflona / activeclinic-demo; submit via form action `/book/submit`.

**HTTP / API:**

- Inquiry: **200** → `/contact/success`; rows inserted into `activeclinic.public_contact_inquiries` (e.g. `v8inq…@example.invalid`).  
- Booking: **200** title `Request submitted · ActiveClinic` on `/book/submit`.  
- Hosted-auth QA `bookingSubmit.ok=true` on disposable fixture.

**Application logs:** no Hostinger app log pull in this task; request IDs often absent on edge responses.

**Likely root cause (original BUG-001):** submit rate limiter applied to wizard navigation POSTs (fixed on V7; not reproduced on V8).

**Automated coverage:**

- `tests/activeclinic-public-booking.test.js` (BUG-001 rate-limit / HTML 429)  
- Hosted path: `npm run activeclinic:hosted-auth-qa:testing -- --base-url=https://activeclinic.neuniversity.org`

---

## 2. Duplicate staff phone during clinic registration

**Status:** Blocked  

**Routes:** `GET/POST /register-clinic` (steps `clinic` → `administrator` → `review`, confirm `action=confirm`)

**Reproduction steps attempted:**

1. Register clinic A with unique email + ZM phone `97……`.  
2. Register clinic B with different email + **same phone** + different password.  
3. Both UIs redirected to `/register-clinic/success?ref=…&review=1`.

**HTTP / API:**

- UI: **200** “Clinic created”.  
- DB: both applications `provision_failed` / `provision_failure` at stage `organization` (`AC-MUA529WI-6A1C24`, `AC-MUA52C61-712BF3`).  
- Identity uniqueness gate **not reachable** because tenant provision fails first (missing V8 deployment catalogue row).

**Likely root cause (for blocked verification):** missing `platform.deployments` row for `moovex-platform-v8-testing`.  
**Original BUG-009 product cause (V7):** unauthorized phone reuse without password-verified REUSE in shared identity resolution.

**Automated coverage:**

- `tests/v7-shared-phone-identity.test.js` (BUG-009)  
- `scripts/local/ac-registration-identity-hosted-qa.js` (V7 host)

---

## 3. Clinic service CRUD and publishing

**Status:** Blocked  

**Routes (intended):**

- `GET /app/settings/website/catalogue?tab=services`  
- `GET/POST /app/settings/website/catalogue/services/new`  
- visibility/publish via catalogue + website publish flows

**Reproduction steps attempted:**

1. Provision disposable `ac-hqa-*` via testing fixture.  
2. `POST /login` with `login_email` + fixture password against V8.  
3. Result: **401**; no session cookie → catalogue routes redirect to `/login`.

**HTTP / API:** `staffLoginPost` 401; authenticated catalogue never reached.

**Likely root cause:** V8 deployment catalogue / session creation failure (see cross-cutting blocker). Public service pages for demo clinics load (200) but are not a CRUD proof.

**Automated coverage:**

- `tests/activeclinic-website-cms.test.js`  
- `tests/v7-website-public-catalogue.test.js`

---

## 4. Doctor profile CRUD and publishing

**Status:** Partial  

**Public routes verified:**

- `GET /clinics/julflona-clinic/doctors` → **200**, profiles linked  
- `GET /clinics/julflona-clinic/doctors/dr-julflona-banda` → **200**  
- Same pattern on `activeclinic-demo`

**CRUD / publish routes:** `/app/settings/website/catalogue?tab=doctors` — **Blocked** (login 401).

**Likely root cause:** public resolution already fixed for published tenants (BUG-004); staff CRUD blocked by V8 auth/session.

**Automated coverage:**

- `tests/activeclinic-public-website.test.js`  
- `tests/v7-website-public-catalogue.test.js`  
- `tests/activeclinic-clinic-directory.test.js` (related public surfaces)

---

## 5. Directory-to-clinic navigation

**Status:** Already Fixed  

**Routes:** `GET /clinics` → card `a[data-ac-clinic-card-link="1"]` → `GET /clinics/:clinicKey`

**Reproduction steps:**

1. Open directory.  
2. Follow each `data-ac-clinic-card-link` href.

**HTTP / API:** 7/7 cards **200** to matching clinic detail (including leftovers and demos). Markup includes `data-ac-clinic-card-link="1"`.

**Likely root cause (original BUG-006):** card markup/CSS preventing navigation — not reproduced on V8.

**Automated coverage:**

- `tests/activeclinic-clinic-directory.test.js` (`directory card href resolves to clinic detail…`)

---

## 6. Staff invitation and account setup (regression)

**Status:** Blocked  

**Routes:** `GET/POST /app/staff/invite` (and staff create paths)

**Evidence:** Hosted-auth QA against V8: `staffInviteGet` / `staffInviteCreate` fail with login redirect after `staffLoginPost` 401. Mobile invite chrome GET (unauthenticated overflow check) returned 200 in harness mobile probes only.

**Automated coverage:**

- `tests/activeclinic-staff-invitation.test.js`  
- `tests/activeclinic-mf07-staff-invite.test.js` (if present in suite)

---

## 7. Website text and image+text sections (regression)

**Status:** Blocked  

**Routes:** website hub / home editor under `/app/settings/website…`

**Evidence:** `websiteHub` / `websitePages` → 303 `/login` after failed staff auth.

**Automated coverage:**

- `tests/shared-website-section-lifecycle.test.js`  
- `tests/v8-shared-website-sections.test.js`  
- `tests/v8-shared-website-lifecycle.test.js`  
- shared editor wave tests under `tests/shared-website-editor-*.test.js`

---

## 8. About-section image upload (regression)

**Status:** Blocked  

**Routes:** `/app/settings/website/about` (+ media upload / publish)

**Evidence:** unreachable without staff session on V8.

**Automated coverage:**

- shared CDN / About / website CMS suites (`tests/activeclinic-website-cms.test.js`, V7/V8 shared website tests)

---

## Hosted-auth QA run (disposable)

```text
npm run activeclinic:hosted-auth-qa:testing -- --confirm \
  --base-url=https://activeclinic.neuniversity.org
```

| Check | Result |
|-------|--------|
| Fixture provision (DB, `moovex-platform-testing`) | OK · bookable · website published |
| Staff login on V8 | **FAIL** 401 · no sid |
| Public booking submit | **PASS** |
| Staff invite / website hub / onboarding | **FAIL** (auth) |
| Cleanup | purged (fixture run) |

Leftover org `ac-hqa-mua52dy9fd9e` from a parallel probe was purged after the run.

Failed hosted registration applications (`v8.qa.owner…`, `v8.qa.other…`) remain as `provision_failed` rows for audit; they did not create usable orgs.

---

## Database changes

**None** in this task (no migrations, no catalogue inserts).  

Read-only / disposable writes during QA:

- public inquiries + booking requests on existing published clinics  
- failed registration application rows  
- temporary `ac-hqa-*` org (purged)

---

## Test results and coverage

| Layer | Result |
|-------|--------|
| Hosted V8 reproduction (this baseline) | Documented per item above |
| Existing automated suites | Mapped; **not re-executed as a full AC regression gate in this task** (no product code change) |
| V7 login control | PASS (demo org admin) |
| V8 login control | FAIL 401 (same credentials) |

---

## Commit / push

Filled after commit of this document to `origin/V8`.

---

## Hosted SHA and QA result

| Field | Value |
|-------|-------|
| Hosted AC SHA | `6c82c972237c` |
| Hosted deployment | `moovex-platform-v8-testing` |
| Baseline verdict | `V8_AC_QA_BASELINE_COMPLETE` |
| Hosted product PASS? | **No** — auth-gated bugs blocked; public booking/inquiry/directory already fixed |

---

## V7 compatibility status

- V7 AC remains operational on `pronline.org` at `03a89106e2fe`.  
- Shared testing DB unchanged in schema by this task.  
- V8 auth/session depends on a **missing** deployments catalogue row; V7’s `moovex-platform-testing` row continues to serve V7 login.

---

## Outstanding blockers

1. **Insert / activate `platform.deployments` row for `moovex-platform-v8-testing`** (canonical domain `neuniversity.org`, session cookie `moovex_platform_v8_testing_sid`, testing env) — prerequisite for staff login, registration provision, and items 2–4 / 6–8.  
2. Re-run disposable staff flows (service CRUD, doctor CRUD/publish, invite, sections, About image) after catalogue fix.  
3. Re-test BUG-009 on hosted V8 with successful provision (unauthorized reuse must reject; authorized multi-clinic reuse must pass).  
4. Do not treat registration `success?review=1` alone as provision success — check `clinic_registration_applications.provisioning_status`.

---

## Mapping to V1.3 QA IDs

| Baseline # | V1.3 ID | Theme |
|------------|---------|-------|
| 1 | BUG-001 | Booking / inquiry |
| 2 | BUG-009 | Duplicate phone / shared identity |
| 3 | BUG-003 | Service catalogue CRUD |
| 4 | BUG-004 | Doctor public listing / profiles |
| 5 | BUG-006 | Directory → clinic detail |
| 6 | BUG-002 | Staff invitation |
| 7 | BUG-007 | Text / Image+Text sections |
| 8 | BUG-008 | About image |
