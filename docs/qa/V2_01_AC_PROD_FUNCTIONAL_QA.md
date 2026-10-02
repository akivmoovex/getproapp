# V2.01 ActiveClinic Production Functional Pack

**Task:** `V2_01_AC_PROD_FUNCTIONAL_PACK`  
**Date:** 2026-09-26  
**Product:** ActiveClinic only  
**Mode:** Concise production-candidate smoke — current supported flows; disposable tenant only  
**Release candidate:** `gitSha=03a89106e2fe` · `moovex-platform-production` · `environment=production`  
**Clinic:** `activeclinic-disposable-qa-bd9d83`  
**Personas:** `docs/qa/V2_01_PROD_QA_ACCOUNTS.md`  
**Evidence:** `/tmp/v2_01_ac_prod_functional_qa.json` (local ops artifact; not committed)  
**Production code changes:** **None**

**Constraints honored:** No facility mini-websites invented · no real patient PHI · guest booking used `@example.invalid` only · disposable patient portal account only

---

## Verdict

| Metric | Count |
| --- | ---: |
| **PASS** | **32** |
| **FAIL** | **0** |
| **BLOCKED** | **0** |

**Overall: PASS**

No blockers on this RC for the requested smoke set.

---

## Environment

| Surface | Result |
| --- | --- |
| `https://activeclinic.org/healthz` | `03a89106e2fe` · production · ok |
| Disposable clinic | `/clinics/activeclinic-disposable-qa-bd9d83` |
| Staff admin | `prod.qa.ac.bd9d83@getproapp.org` |
| Restricted | `prod.qa.ac.editor.abcftf@getproapp.org` |
| Patient (portal) | `prod.qa.ac.patient.abk76i@getproapp.org` |

---

## PASS / FAIL matrix

| Check | Result | Detail |
| --- | --- | --- |
| Healthz gate | **PASS** | `03a89106e2fe` |
| Registration surface | **PASS** | `GET /register-clinic` **200** (no new org created) |
| Login | **PASS** | Staff → `/app` |
| Forgot-password initiation | **PASS** | Form **200**; POST → **303** `/forgot-password/check` (delivery not asserted) |
| Clinic directory → clinic | **PASS** | `/clinics` lists disposable → clinic home |
| Website edit mode | **PASS** | Edit chrome + CSRF + field keys |
| Services edit | **PASS** | `/app/settings/website/catalogue` services tab **200** |
| Doctors edit | **PASS** | Catalogue doctors tab **200** |
| Services/doctors heading drafts | **PASS** | Inline draft keys saved |
| Image edit | **PASS** | Media upload + `home.hero.image` draft |
| Save draft | **PASS** | `home.hero.title` marker saved |
| Preview | **PASS** | Supported path: `?website_mode=draft` or `GET …/website/preview` → draft overlay shows unpublished content |
| Publish | **PASS** | `POST …/website/publish` → `published` |
| Public verification | **PASS** | Anon clinic home shows published marker |
| Booking | **PASS** | Wizard → `booking-request-submitted` / pending confirmation |
| Patient portal basic access | **PASS** | Disposable patient → `/clinics/…/patient` dashboard |
| Staff-role denial | **PASS** | Restricted: `/app/patients` **403**; publish **403** `forbidden`; no publish chrome |
| Logout | **PASS** | `POST /logout` → `/login`; `/app` requires login |
| Desktop 1440 (edit / public / directory / book) | **PASS** | |
| Mobile 390 (edit / public / directory / book) | **PASS** | No horizontal overflow |

---

## Blockers

**None.**

---

## Notes (non-FAIL)

| Note | Detail |
| --- | --- |
| Preview query | `?website_mode=preview` alone does **not** overlay unpublished drafts on this RC; use **draft** mode / `/website/preview` (redirects to draft) — scored against that supported path |
| Password delivery | Initiation PASS only; live email delivery remains **V8-001** (out of scope) |
| CSRF freshness | Draft/media POSTs require a CSRF token from a fresh edit page after other staff POSTs |
| Facility websites | Not tested / not invented |

---

## Explicit non-actions

| Action | Status |
| --- | --- |
| Production product / infra / schema changes | Not performed |
| New clinic registration write | Not performed (surface only) |
| Real patient data | Not used |
| Facility website creation | Not performed |

---

## Return token

```
V2_01_AC_PROD_FUNCTIONAL_QA = PASS
PASS=32 FAIL=0 BLOCKED=0
blockers=[]
```
