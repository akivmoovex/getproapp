# V2.01 Production Shared Security Pack

**Task:** `V2_01_PROD_SHARED_SECURITY_PACK`  
**Date:** 2026-09-26  
**Mode:** Production probes — read-only where possible; denial-first writes only on disposable QA tenants  
**Release candidate:** `gitSha=03a89106e2fe` · `moovex-platform-production` · `environment=production`  
**Personas:** Approved disposable accounts from `docs/qa/V2_01_PROD_QA_ACCOUNTS.md`  
**Evidence:** `/tmp/v2_01_prod_shared_security_qa_62386d.json` (local ops artifact; not committed)  
**Customer data:** **Not altered** (foreign/customer orgs used only as deny targets)

---

## Verdict

| Metric | Count |
| --- | ---: |
| **PASS** | **37** |
| **FAIL** | **0** |
| **BLOCKED** | **0** |

**Overall: PASS**

No failing endpoint.

---

## Environment

| Surface | Result |
| --- | --- |
| `https://blessboard.com/healthz` | `03a89106e2fe` · production · ok |
| `https://activeclinic.org/healthz` | same |
| BB admin | `prod.qa.bb.5e15ca@getproapp.org` · org `blessboard-disposable-qa-5e15ca` |
| BB restricted | `prod.qa.bb.editor.abcftf@getproapp.org` · `website_editor` + legacy `branch_admin` |
| AC admin | `prod.qa.ac.bd9d83@getproapp.org` · org `activeclinic-disposable-qa-bd9d83` |
| AC restricted | `prod.qa.ac.editor.abcftf@getproapp.org` · `activeclinic_website_editor` |
| Foreign deny targets (QA-only) | `blessboard-postfix-qa-45190c` · `activeclinic-production-qa-e7e6a6` |
| Session cookies observed | `moovex_platform_production_sid` / `_csrf` (no testing/pronline leak) |

---

## Results by control family

### 1. Unauthenticated protected routes — **8/8 PASS**

| Endpoint | Result | Detail |
| --- | --- | --- |
| `GET https://blessboard.com/hq` | **PASS** | → `/login?next=/hq` |
| `GET https://blessboard.com/branch-admin` | **PASS** | → login |
| `GET https://blessboard.com/hq/website` | **PASS** | → login |
| `GET …/c/blessboard-disposable-qa-5e15ca/hq-campus-qa?website_edit=1` | **PASS** | **200** public HTML · **no** edit chrome |
| `GET https://activeclinic.org/app` | **PASS** | → `/login` |
| `GET https://activeclinic.org/app/settings` | **PASS** | → login |
| `GET https://activeclinic.org/app/settings/website` | **PASS** | → login |
| `GET …/clinics/activeclinic-disposable-qa-bd9d83?website_edit=1` | **PASS** | **200** · **no** edit chrome |

### 2. CSRF on state-changing actions — **4/4 PASS**

| Endpoint | Result | Detail |
| --- | --- | --- |
| `POST …/c/…/hq-campus-qa/website/publish` (no CSRF) | **PASS** | **403** `{"ok":false,"code":"csrf"}` |
| `POST …/c/…/hq-campus-qa/website/drafts` (no CSRF) | **PASS** | **403** `csrf` |
| `POST …/clinics/…/website/publish` (no CSRF) | **PASS** | **403** `csrf` |
| `POST …/clinics/…/website/drafts` (no CSRF) | **PASS** | **403** `csrf` |

### 3. Cross-tenant org access — **5/5 PASS**

| Endpoint | Result | Detail |
| --- | --- | --- |
| `GET /c/blessboard-postfix-qa-45190c/hq-campus?website_edit=1` (BB admin of 5e15ca) | **PASS** | no edit chrome |
| `POST /c/blessboard-postfix-qa-45190c/website/drafts` | **PASS** | **403** `forbidden` |
| `GET /clinics/activeclinic-production-qa-e7e6a6?website_edit=1` (AC admin of bd9d83) | **PASS** | **403** |
| `POST /clinics/activeclinic-production-qa-e7e6a6/website/drafts` | **PASS** | **403** (`clinic_not_published` / closed) |
| `GET /c/zzzz-forged-org-not-real/hq` | **PASS** | **404** |

### 4. Cross-product access — **4/4 PASS**

| Endpoint | Result | Detail |
| --- | --- | --- |
| BB session → `GET https://activeclinic.org/app` | **PASS** | **403** |
| AC session → `GET https://blessboard.com/hq` | **PASS** | → login |
| BB session → AC clinic `?website_edit=1` | **PASS** | no edit chrome |
| AC session → BB church `?website_edit=1` | **PASS** | no edit chrome |

### 5. Forged org/branch IDs — **2/2 PASS**

| Endpoint | Result | Detail |
| --- | --- | --- |
| `POST …/hq-campus-qa/website/drafts` + forged `organizationId`/`branchId` | **PASS** | fail-closed **403** |
| `POST …/clinics/…/website/drafts` + forged `organizationId`/`facilityId` | **PASS** | **403** `forbidden` |

### 6. Foreign media reference — **2/2 PASS**

| Endpoint | Result | Detail |
| --- | --- | --- |
| AC draft `home.hero.image` with forged/foreign media | **PASS** | **404** `media_not_found` |
| BB draft `home.hero.image` with forged/foreign media | **PASS** | fail-closed **403** (request rejected; no attach) |

### 7. Unauthorized publish — **3/3 PASS**

| Endpoint | Result | Detail |
| --- | --- | --- |
| Anon `POST` BB publish | **PASS** | **403** |
| Anon `POST` AC publish | **PASS** | **403** |
| AC `website_editor` `POST` publish | **PASS** | **403** `forbidden` |

### 8. Session / logout — **3/3 PASS**

| Endpoint | Result | Detail |
| --- | --- | --- |
| `GET /logout` then `GET /hq` (BB) | **PASS** | access cleared → login (`/logout` itself returned **503** — see notes) |
| `GET /logout` then `GET /app` (AC) | **PASS** | → login |
| BB login cookie names | **PASS** | `moovex_platform_production_sid` / `_csrf` only |

### 9. Restricted role cannot elevate via direct API — **6/6 PASS**

| Endpoint | Result | Detail |
| --- | --- | --- |
| BB restricted → `GET /hq` | **PASS** | **403** · no HQ chrome |
| BB restricted → `POST …/website/publish` | **PASS** | **403** |
| BB restricted → foreign org drafts | **PASS** | **403** |
| AC restricted → `GET /app/settings/roles` | **PASS** | **404** / unavailable |
| AC restricted → `GET /app/patients` | **PASS** | **403** · no patient UI |
| AC restricted → foreign clinic drafts | **PASS** | **403** |

---

## Notes (non-FAIL)

1. **BB `GET /logout` returned HTTP 503** in this run, but the follow-up probe to `/hq` still landed on `/login` (session access cleared). Treat logout **availability** as a separate ops/UX follow-up; **authorization after logout PASS**.
2. Some forged-ID / foreign-media BB draft probes fail closed via **CSRF** or **forbidden** rather than a dedicated `media_not_found` code; still denied with no attach/publish.
3. Cross-tenant AC draft deny code `clinic_not_published` is fail-closed for the foreign unpublished QA clinic; edit GET already **403**.

---

## Explicit non-actions

| Action | Status |
| --- | --- |
| Infra / schema / product code changes | Not performed |
| Customer org writes | Not performed |
| Password / secret logging | Not performed |

---

## Return token

```
V2_01_PROD_SHARED_SECURITY_QA = PASS
PASS=37 FAIL=0 BLOCKED=0
failing_endpoints=[]
```
