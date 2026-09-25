# V2.01 Release Notes Center QA

**Task:** `V2_01_RELEASE_NOTES_HOSTED_DEPLOY_AND_QA` (follow-on to `V2_01_RELEASE_NOTES_CENTER`)  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Deployment:** `moovex-platform-v8-testing` (neuniversity.org)  
**Database:** `moovex-platform-v7` / `testing`  
**Products:** BlessBoard, ActiveClinic, Shared GetPro Platform  
**Priority:** P1  

**Production:** untouched  

---

## Verdict

**`V2_01_RELEASE_NOTES_CENTER_QA_BLOCKED`**

Public Release Notes Center is **hosted and verified** on the V8 QA hub. Final PASS is **blocked** because `RELEASE_NOTES_INTERNAL_TOKEN` is **not configured** on the Hostinger V8 testing Node app — internal QA evidence unlock cannot be completed without inventing or bypassing the gate (forbidden).

Public sanitized share URL is verified and safe to share with QA for non-internal content.

---

## 1. Source and deployment identity

| Item | Value |
|------|-------|
| Final source / `origin/V8` HEAD | `1c01649891c1a92ea46c6eb137e30d4e09422a6e` |
| Hosted application SHA (all V8 hosts) | `1c01649891c1` |
| Deployment code | `moovex-platform-v8-testing` |
| Environment | `testing` |
| Database identity | `moovex-platform-v7` / `testing` |
| Platform line | `v8` |
| Release Notes + Change Manager commit | `657454ac3b0abbf489679e4c482a26c39360cccb` |
| Field-history stale-conflict fix commit | `1c01649891c1a92ea46c6eb137e30d4e09422a6e` |
| Publish diagnostics fix commit | `45cf7648` (ancestor of tip — included) |
| Deploy mechanism | `git push origin V8` → Hostinger git-linked app (existing approved workflow) |

### Pre-deploy check

| Check | Result |
|-------|--------|
| Local tip before commit | `e5bd58ad` (diagnostics only; RNC/CM uncommitted) |
| Intended deploy includes RNC + Field History + diagnostics | **Yes** after `657454ac` / `1c016498` |
| Production SHAs | `blessboard.com` / `activeclinic.org` remain `03a89106e2fe` / `moovex-platform-production` |

---

## 2. Internal access configuration

| Check | Result |
|-------|--------|
| `RELEASE_NOTES_INTERNAL_TOKEN` in local `.env` | **Absent** |
| Token readable from Hostinger without hPanel | **No** (no Hostinger CLI/SSH in agent) |
| Public view without token | Evidence column hidden; documentation gaps withheld; no secrets |
| Wrong `internal_token` query value | Does **not** unlock internal sources |
| Invented / default token | **Not used** |

### STOP — Hostinger step required for internal QA

In **hPanel → Websites → Node.js → `moovex-platform-v8-testing` → Environment variables**, add:

1. Name: `RELEASE_NOTES_INTERNAL_TOKEN`
2. Value: a long random secret known only to authorized QA (do not commit it)
3. Restart / redeploy the **testing** Node app only
4. Re-open `/release-notes/2.01/qa?internal_token=<secret>` (or header `X-Release-Notes-Internal-Token`)
5. Confirm Evidence column and source paths appear **only** with the correct token

Do **not** set this on production.

---

## 3. Hosted Release Notes routes

**Verified shareable overview URL:**  
https://neuniversity.org/release-notes

| Path | HTTP | Notes |
|------|------|-------|
| `/release-notes` | **200** | All six version cards |
| `/release-notes/1.0` | **200** | |
| `/release-notes/1.1` | **200** | DOCUMENTATION PENDING |
| `/release-notes/1.2` | **200** | DOCUMENTATION PENDING |
| `/release-notes/1.3` | **200** | |
| `/release-notes/2.0` | **200** | |
| `/release-notes/2.01` | **200** | About / diagnostics / Change Manager present |
| `/release-notes/2.01/bugs` | **200** | |
| `/release-notes/2.01/qa` | **200** | Public checklist; evidence gated |
| `/release-notes/2.01/share` | **200** | Sanitized summary; no secrets |
| `/release-notes/2.01/print` | **200** | Print layout |
| `/platform/release-notes-center.css` | **200** | |
| `/platform/release-notes-center.js` | **200** | |

### Version-specific shareable URLs (verified 200)

- https://neuniversity.org/release-notes/1.0
- https://neuniversity.org/release-notes/1.1
- https://neuniversity.org/release-notes/1.2
- https://neuniversity.org/release-notes/1.3
- https://neuniversity.org/release-notes/2.0
- https://neuniversity.org/release-notes/2.01

Filters: product Infrastructure vs BlessBoard changes content size as expected. Desktop + ~390px mobile viewport checked in browser (layout usable; Stitch UI still DOCUMENTATION PENDING).

Production product hosts do not serve this hub center as a successful public RNC (BB production `/release-notes` → 503; AC → 404). Production deployment env remains isolated.

---

## 4. Field History database QA (testing DB, disposable tenants)

Script: `scripts/local/v2-01-field-history-testing-db-qa.js`  
Identity confirmed: `moovex-platform-v7` / `testing`  
**No** `resetFoundationDatabase` against shared DB.

| Case | Result |
|------|--------|
| Undo / currently published text restore; unrelated draft preserved; pending count | **PASS** |
| Earlier published restore; previously_saved unavailable; auth deny; no auto-publish | **PASS** |
| Image field currently-published restore; no auto-publish | **PASS** |
| Tenant isolation | **PASS** |
| Stale `expectedUpdatedAt` conflict on undo/discard | **PASS** (`conflict`) — required code fix in `1c016498` |

BB+AC Change Manager JS (`website-change-manager-ui.js`) returns **200** with history markers on both V8 product hosts.

---

## 5. Regression

| Check | Result |
|-------|--------|
| `npm run test:v8:hosted-smoke` (BB+AC) | **PASS** (`gitSha=1c016498…` after final deploy) |
| BB `/about` shows 2.01 | **200** |
| AC `/about` shows 2.01 | **200** |
| BB/AC `/login` | **200** |
| AC `/clinics` | **200** |
| Hub `/` + Release Notes link | **200** |
| Production BB/AC healthz | Untouched (`03a89106e2fe`, `moovex-platform-production`) |

Publishing diagnostics remain on tip ancestry (`45cf7648`). Multi-item publish was previously HOSTED QA PASS; not re-run as a full write session in this task beyond disposable field-history publishes on throwaway tenants.

---

## 6. Remaining gaps

1. **`RELEASE_NOTES_INTERNAL_TOKEN` missing on Hostinger** → blocks final PASS / internal evidence verification.  
2. Stitch Release Notes screens still DOCUMENTATION PENDING.  
3. Interactive authenticated BB/AC editor History UI click-through on hosted tenants not separately recorded (service-layer disposable QA PASS).  
4. Docs tip may lag app SHA after this report commit.

---

## 7. Explicit non-actions

| Action | Done? |
|--------|-------|
| Production deploy | **No** |
| Invent / bypass internal token | **No** |
| Shared DB reset/migrate | **No** |
| Modify real customer content | **No** (disposable `fh_qa_*` tenants only) |

---

## Verdict (restated)

**`V2_01_RELEASE_NOTES_CENTER_QA_BLOCKED`** — public hosted routes and shareable URLs verified on SHA `1c016498`; blocked on missing Hostinger `RELEASE_NOTES_INTERNAL_TOKEN` for authorized internal QA unlock.
