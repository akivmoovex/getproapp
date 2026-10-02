# V8 ActiveClinic QA Bug Closure

**Recorded:** 2026-09-20T19:25:00Z (approx.)  
**Branch:** `V8` only  
**Verdict:** `V8_AC_QA_BUG_CLOSURE_PASS`  
**Hosted AC SHA:** `56a51545c8b4` (`moovex-platform-v8-testing` / `testing` / `platformLine=v8`)  
**Local / origin/V8 tip at closure:** `56a51545c8b4386f151537be381da8c6d7fd6ccb` (+ CMS test helper fix in this commit)  
**Source:** ActiveClinic V1.3 QA items (20 September 2026) — bugs 1–5 re-test + regressions 6–8 + shared BB/AC media  
**Production:** untouched  

Evidence (local agent): `/tmp/v8-ac-qa-closure/` (`hosted-closure.json`, `regression.log`, `focused2.log`, `media-probe.json`).

---

## Environment matrix

| Surface | Host | SHA / note |
|---------|------|------------|
| V8 AC QA | `https://activeclinic.neuniversity.org` | `56a51545c8b4` · healthz OK · schemaCompatible |
| V8 BB QA | `https://blessboard.neuniversity.org` | media delivery exercised |
| Shared DB | `moovex-platform-v7` / `testing` | used by V7 + V8 |
| Media write (V8) | `testing-v8/` | Hostinger CDN |
| Media read (shared) | `testing/` | BB + AC marketing assets |
| Production | untouched | — |

Disposable fixture used for auth-gated checks: `ac-hqa-mua7j2js0a19` (cleanup **blocked** on `operational_data` — leftover org remains for later purge).

---

## Status summary

| # | Item | Hosted status |
|---|------|---------------|
| 1 | Booking / inquiry submission | **PASS** |
| 2 | Duplicate phone registration | **PASS** |
| 3 | Clinic service management | **PASS** |
| 4 | Doctor public profiles | **PASS** |
| 5 | Directory-to-clinic navigation | **PASS** |
| 6 | Staff invitation and account setup (regression) | **PASS** |
| 7 | Website section editing and publishing (regression) | **PASS** |
| 8 | About-section image upload (regression) | **PASS** |
| — | Shared BB/AC media delivery | **PASS** |

---

## 1. Booking / inquiry submission

**Status:** PASS  

**Evidence (hosted disposable `ac-hqa-mua7j2js0a19` / prior run `ac-hqa-mua7fpsv39ef`):**

| Check | HTTP / result |
|-------|----------------|
| Booking wizard → `POST …/book/submit` | **200** · request submitted |
| Contact inquiry → `POST …/contact` | **303** → `/clinics/…/contact/success` |

---

## 2. Duplicate phone registration

**Status:** PASS  

**Evidence:**

| Attempt | Result |
|---------|--------|
| First clinic (`closure-a-…@example.invalid`, unique ZM `97……`) | **303** → `/register-clinic/success?ref=AC-MUA7JYIM-68694B&ready=1` · `created=true` |
| Second clinic (different email, **same phone**, different password) | **400** · duplicate message surfaced · `created=false` · `duplicateMessage=true` |

Wizard flow used signed draft steps (`next-clinic` → `next-admin` → `confirm` + `registration_consent`) with review hidden fields (including `contactEmail`) so confirm rate-limit buckets stay per-email.

---

## 3. Clinic service management

**Status:** PASS  

| Check | Result |
|-------|--------|
| `POST /app/settings/website/catalogue/services/new` | **303** |
| DB `public_website_visible` | `true` |
| Public `/clinics/…/services` | service name visible |

---

## 4. Doctor public profiles

**Status:** PASS  

| Check | Result |
|-------|--------|
| `POST …/catalogue/doctors/new` | **303** |
| `platform_identity_id` | `null` (no login) |
| `public_profile_enabled` | `true` |
| Public `/clinics/…/doctors` | name visible |

---

## 5. Directory-to-clinic navigation

**Status:** PASS  

| Check | Result |
|-------|--------|
| `GET /clinics` | **200** · card count ≥ 8 |
| Card links | `data-ac-clinic-card-link="1"` → `/clinics/:clinicKey` |
| Follow sample cards | **200** each |
| Legacy heading-only anchors | not present (`!<h2><a href=`) |

---

## 6. Staff invitation (regression)

**Status:** PASS  

| Check | Result |
|-------|--------|
| Staff login | **303** → `/app` · V8 sid present |
| `GET /app/staff/new?invite=1` | **200** |
| Invite POST | **200** · invitation created UI |

---

## 7. Website sections (regression)

**Status:** PASS  

| Check | Result |
|-------|--------|
| Hub / pages / sections | **200** / **200** / **200** |
| Section save / reorder | **303** |

---

## 8. About-section image upload (regression)

**Status:** PASS  

Route under test is the **public About editor** (`/clinics/:key/about?website_edit=1&website_mode=draft`), not `/app/settings/website/about` (404).

| Check | Result |
|-------|--------|
| Live About | **200** |
| Edit mode (pencil / `about.story.image`) | **200** · editor present |
| Media library | **200** |
| `POST …/website/media` (1×1 PNG) | **200** · `mediaId=826543b8-…` · storage under `testing-v8/` |
| `POST …/website/drafts` `contentKey=about.story.image` | **200** · draft saved |

---

## Shared BB / AC media delivery

**Status:** PASS  

| Page | Status | Images probed |
|------|--------|---------------|
| `https://blessboard.neuniversity.org/` | **200** | 6 |
| `https://activeclinic.neuniversity.org/` | **200** | 4 |
| `https://activeclinic.neuniversity.org/clinics/julflona-clinic` | **200** | 1 |

All **11** sample `/media/testing/…` assets returned **200** with image content-types. No `pronline.org` hosts; no accidental public reliance on `testing-v8/` for shared marketing bytes.

---

## Automated suites

### Full V8 regression (`npm run test:v8:regression`)

| Suite | Tests | Pass | Fail |
|-------|------:|-----:|-----:|
| shared-platform | 357 | 357 | 0 |
| compatibility (V7 DB compat) | 272 | 272 | 0 |
| blessboard | 241 | 241 | 0 |
| activeclinic | 105 | 105 | 0 |
| **Total** | **975** | **975** | **0** |

Wall clock: **343.4s**. Verdict: `[v8-regression] PASS`.

Includes security / session / media-namespace / cross-product tenant isolation coverage under shared-platform and focused AC files.

### Focused AC / shared checks (post CMS helper fix)

| Suite slice | Result |
|-------------|--------|
| CMS + catalogue + booking + phone identity + V8 isolation + session + website lifecycle | **60/60 PASS** (`focused2.log`) |
| `tests/activeclinic-website-cms.test.js` alone | **9/9 PASS** (helper sets `public_website_visible=true`) |

**Code fix in this closure commit:** `insertPublicService` in `tests/activeclinic-website-cms.test.js` inserts `public_website_visible=true` so published website listing assertions match `listWebsiteServices` (filters `public_website_visible = true`). Product behaviour unchanged; test fixture alignment only.

---

## Cleanup note

Disposable `ac-hqa-*` purge returned `status=blocked` (`operational_data` present after booking/services/doctors writes). Orgs remain marked for later testing purge; production untouched.

---

## Commit / push

| Field | Value |
|-------|-------|
| Closure report + CMS helper | this commit on `V8` |
| Push | `origin/V8` |

---

## Final QA result

| Field | Value |
|-------|-------|
| Hosted AC SHA | `56a51545c8b4` |
| Hosted deployment | `moovex-platform-v8-testing` |
| All eight items + media | **PASS** (hosted HTTP evidence) |
| Regression gate | **PASS** (975/975) |
| Closure verdict | **`V8_AC_QA_BUG_CLOSURE_PASS`** |
