# V2.01 Production Publish Auth QA

**Task:** `V2_01_PROD_PUBLISH_AUTH_QA`  
**Date:** 2026-09-26  
**Mode:** Production allow/deny probes on disposable QA tenants — denial-first; no customer data  
**Release candidate:** `gitSha=03a89106e2fe` · `moovex-platform-production` · `environment=production`  
**Personas:** Approved disposable accounts from `docs/qa/V2_01_PROD_QA_ACCOUNTS.md`  
**Evidence:** `/tmp/v2_01_prod_publish_auth_retest.json` (authoritative) · `/tmp/v2_01_prod_publish_auth_qa_176c96.json` (first-pass; UI false positives — see notes)  
**Authorization model changes:** **None** (no current failure reproduced)

---

## Verdict

| Metric | Count |
| --- | ---: |
| **PASS** | **14** |
| **FAIL** | **0** |
| **BLOCKED** | **0** |

**Overall: PASS**

Publish allow/deny, primary UI visibility, direct API bypass, and forged tenant/org rejection hold on the RC for BlessBoard and ActiveClinic. Shared platform auth was **not** modified.

---

## Environment

| Surface | Result |
| --- | --- |
| `https://blessboard.com/healthz` | `03a89106e2fe` · production · ok |
| `https://activeclinic.org/healthz` | same |
| BB admin | `prod.qa.bb.5e15ca@getproapp.org` · org `blessboard-disposable-qa-5e15ca` · branch `hq-campus-qa` |
| BB restricted | `prod.qa.bb.editor.abcftf@getproapp.org` · catalogue `website_editor` + legacy `branch_admin` @ `hq-campus-qa` |
| AC admin | `prod.qa.ac.bd9d83@getproapp.org` · org `activeclinic-disposable-qa-bd9d83` |
| AC restricted | `prod.qa.ac.editor.abcftf@getproapp.org` · `activeclinic_website_editor` |
| Foreign deny targets (QA-only) | `blessboard-postfix-qa-45190c` · `activeclinic-production-qa-e7e6a6` |
| Session cookies | `moovex_platform_production_sid` / `_csrf` |

**UI gate (shared):** `shell.canPublish` → chrome Publish form only when true (`views/platform/website-engine/editor-chrome.ejs` · `data-website-engine-publish`). Lifecycle dialog host may still contain template “Publish” buttons in the DOM; those are **not** primary chrome and were excluded from visibility scoring.

---

## Matrix results

### BlessBoard

| Case | Expect | Result | Detail |
| --- | --- | --- | --- |
| Authorized website publisher → allow | allow | **PASS** | `POST …/c/…/hq-campus-qa/website/publish` → **200** `published`; chrome Publish form present |
| Restricted role → deny | deny | **PASS** | API **403** (no usable CSRF / edit publish chrome); primary toolbar Publish **hidden**; `data-website-engine-publish` absent |
| Wrong org/branch scope → deny | deny | **PASS** | Admin of `5e15ca` → `POST …/c/blessboard-postfix-qa-45190c/website/publish` → **403**; no chrome Publish |

### ActiveClinic

| Case | Expect | Result | Detail |
| --- | --- | --- | --- |
| Authorized clinic publisher → allow | allow | **PASS** | `POST …/clinics/…/website/publish` → **200** `published`; chrome Publish present |
| Restricted role → deny | deny | **PASS** | API **403** `forbidden` (CSRF token present — RBAC deny); primary Publish **hidden** |
| Wrong clinic scope → deny | deny | **PASS** | Admin of `bd9d83` → foreign clinic publish → **403** `clinic_not_published`; no chrome Publish |

### Cross-cutting controls

| Case | Expect | Result | Detail |
| --- | --- | --- | --- |
| UI Publish follows permission (BB admin) | visible | **PASS** | Primary toolbar Publish visible · engine publish control present |
| UI Publish follows permission (BB restricted) | hidden | **PASS** | No primary Publish · no engine publish control |
| UI Publish follows permission (AC admin) | visible | **PASS** | Primary toolbar Publish visible · engine publish control present |
| UI Publish follows permission (AC restricted) | hidden | **PASS** | No primary Publish · no engine publish control |
| Anon direct API cannot bypass UI (BB) | deny | **PASS** | `POST` publish → **403** |
| Anon direct API cannot bypass UI (AC) | deny | **PASS** | `POST` publish → **403** |
| Forged tenant/org ID rejected (BB body) | reject | **PASS** | Extra forged `organizationId` → **403** `forbidden` |
| Forged clinic path rejected (AC) | reject | **PASS** | `/clinics/zzzz-forged-clinic/website/publish` → **404** |

---

## Scoring notes

1. **First-pass false FAIL (not product):** Initial HTML scrape counted lifecycle-dialog template “Publish” buttons as chrome. Retest scored only primary chrome (`[data-website-engine-publish]`, toolbar buttons outside `[data-website-lifecycle-host]`). UI then matched API for all four personas.
2. **BB restricted API code `csrf` with `tok=false`:** Restricted session does not receive publish chrome / page CSRF for the publish POST path; fail-closed. AC restricted returns explicit **`forbidden`** with a valid CSRF token — stronger signal of role deny after authn.
3. **BB restricted companion `branch_admin`:** Product model may allow own-branch publish in some configurations; this RC run **denied** publish for the disposable restricted persona and hid UI Publish. No auth-model change required.
4. **No shared-layer fix:** Task rule is fix only if a current failure is reproduced. Retest: **0 FAIL** → no code change.

---

## Explicit non-actions

| Action | Status |
| --- | --- |
| Authorization / RBAC model changes | Not performed |
| Infra / schema / product code changes | Not performed |
| Customer org writes | Not performed |
| Password / secret logging | Not performed |

---

## Return token

```
V2_01_PROD_PUBLISH_AUTH_QA = PASS
PASS=14 FAIL=0 BLOCKED=0
auth_model_changed=false
failing=[]
```
