# V2.01 BlessBoard Production Functional Pack

**Task:** `V2_01_BB_PROD_FUNCTIONAL_PACK`  
**Date:** 2026-09-26  
**Product:** BlessBoard only  
**Mode:** Concise production-candidate smoke — current supported flows; disposable tenant only  
**Release candidate:** `gitSha=03a89106e2fe` · `moovex-platform-production` · `environment=production`  
**Tenant:** `blessboard-disposable-qa-5e15ca` / branch `hq-campus-qa`  
**Personas:** `docs/qa/V2_01_PROD_QA_ACCOUNTS.md`  
**Evidence:** `/tmp/v2_01_bb_prod_functional_qa.json` (local ops artifact; not committed)  
**Production code changes:** **None**

---

## Verdict

| Metric | Count |
| --- | ---: |
| **PASS** | **26** |
| **FAIL** | **3** |
| **BLOCKED** | **0** |

**Overall: FAIL**

Core auth, directory → church, edit → draft → preview → publish → public verify, structured edit, HQ/branch admin surfaces, restricted-role denial, logout, and desktop/390 UI smoke **PASS**.

**Blockers:** theme gallery / theme selection and HQ–branch websites switcher routes return **503 Unavailable** on this RC.

---

## Environment

| Surface | Result |
| --- | --- |
| `https://blessboard.com/healthz` | `03a89106e2fe` · production · ok |
| Disposable church | `/c/blessboard-disposable-qa-5e15ca/hq-campus-qa` |
| Admin | `prod.qa.bb.5e15ca@getproapp.org` (+ phone `966965968` / ZM) |
| Restricted | `prod.qa.bb.editor.abcftf@getproapp.org` |
| Customer data | **Not used** |

---

## PASS / FAIL matrix

| Check | Result | Detail |
| --- | --- | --- |
| Healthz gate | **PASS** | `03a89106e2fe` |
| Login email | **PASS** | → `/hq` |
| Login phone | **PASS** | `login_mode=phone` + `phone_national` + `phone_country` → `/hq` |
| Public directory → church | **PASS** | `/directory?q=Disposable` → `/c/…/hq-campus-qa` |
| Website edit mode | **PASS** | Edit chrome + CSRF + field keys |
| Text edit | **PASS** | Draft `home.hero.heading` = marker |
| Image edit | **PASS** | Upload PNG + draft `home.hero.image` |
| Structured item edit | **PASS** | `POST /hq/content/api/structured-draft` (`service_times`) |
| Save draft | **PASS** | Covered by text/image/structured saves |
| Preview | **PASS** | Preview/draft surface shows marker |
| Publish | **PASS** | `POST …/website/publish` → published |
| Public verification | **PASS** | Anon public page contains published marker |
| Styles surface (brand) | **PASS** | `/c/…/website/styles` **200**; save → `?saved=1` |
| Theme gallery | **FAIL** | `/c/…/website/themes`, `/hq/website/themes` → **503 Unavailable** |
| Theme selection | **FAIL** | No reachable theme-pack gallery on RC (styles ≠ theme packs) |
| HQ scope | **PASS** | `/hq` **200** |
| Branch scope | **PASS** | `/branch-admin` **200** |
| HQ/branch websites list | **FAIL** | `/c/…/website/websites` → **503 Unavailable** |
| Restricted-role denial | **PASS** | HQ **403**; publish denied; no publish chrome |
| Logout | **PASS** | Supported `POST /hq/logout` clears session → `/login?next=/hq` |
| Desktop 1440 edit / public / directory | **PASS** | Edit chrome + marker + directory link |
| Mobile 390 edit / public / directory | **PASS** | Same; no horizontal overflow |

---

## Blockers

| ID | Severity | Observation | Impact |
| --- | --- | --- | --- |
| **BB-THEME-503** | **P1** | `GET …/website/themes` and `GET /hq/website/themes` return **503** “Unavailable” (not auth redirect). HQ website hub links styles/SEO/history/media — **no** working theme gallery entry. | Checklist item **theme selection** cannot be completed on current RC |
| **BB-WEBSITES-503** | **P2** | `GET …/website/websites` returns **503 Unavailable**. HQ ↔ branch **admin shells** still work (`/hq`, `/branch-admin`). | Multi-website / scope switcher page unavailable; basic HQ/branch scope otherwise PASS |

### Non-blockers (notes)

| Note | Detail |
| --- | --- |
| Apex `GET /logout` | Still **503** and does **not** clear cookies; **supported** logout is **`POST /hq/logout`** (PASS) |
| Styles vs themes | Brand/styles form works; do **not** treat it as theme-pack selection |

---

## Flow notes (supported)

1. Phone login fields on production form: `login_mode`, `phone_country`, `phone_national`, `password` (not `mode` / `email`).  
2. Canonical publish path: path public editor `POST /c/{org}/{branch}/website/publish`.  
3. Structured drafts: `POST /hq/content/api/structured-draft` (HQ chrome).  
4. Restricted persona: companion `branch_admin` + catalogue `website_editor`; HQ admin and publish remain denied.

---

## Explicit non-actions

| Action | Status |
| --- | --- |
| Product / route fixes for 503 theme/websites | Not performed (report only; no approval to change production) |
| Historical bug-by-bug retest | Not performed (per task) |
| Customer org writes | Not performed |

---

## Return token

```
V2_01_BB_PROD_FUNCTIONAL_QA = FAIL
PASS=26 FAIL=3 BLOCKED=0
blockers=[BB-THEME-503, BB-WEBSITES-503]
```
