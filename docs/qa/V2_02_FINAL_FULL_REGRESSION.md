# V2.02 Final Full Regression

**Task:** `V2_02_FINAL_FULL_REGRESSION`  
**Date:** 2026-09-26T12:11:12Z  
**Branch:** `V9`  
**Production:** **DO NOT TOUCH**

---

## Verdict

### **`V2_02_FINAL_REGRESSION_PASS`**

Local automated coverage for platform / BlessBoard / ActiveClinic / security / release on the current V9 tip is green for authorization and product surfaces required by this gate. The only open automated fails are the known **P2** chrome URL `301` vs `200` expectations (not permission elevation). Hosted V8 testing confirms **About 2.02** and **Release Notes 2.02** for both products on the currently deployed SHA; full hosted retest of the V9 tip (incl. catalogue RBAC) remains **SKIP** until that tip is deployed. Production was not exercised.

---

## Exact SHA

| Ref | Value |
| --- | --- |
| **Committed HEAD (V9 tip)** | `fd2d6f8abf98d063ef0d0e25182130d1b7f193b2` |
| HEAD subject | `Document V2.02 shared RBAC completion and Phase A backfill.` |
| **Working-tree fingerprint** (`git write-tree`) | `c2a14d57825a890649aaf0961f305bbbbc2dac99` |
| Dirty at report | Uncommitted V2.02 soak (legacy-role labels/telemetry, AC login PA catalogue gate, RN QA doc, registration phone fixture) |

Evidence applies to **HEAD + current working tree** on `V9`. Do not treat bare `b186991d` hosted deploy as the full tip.

---

## Automated summary

| Batch | Result | Notes |
| --- | --- | --- |
| Core V2.02 RBAC + isolation | **PASS** `124/124` | Foundation, BB catalogue-only, PA, legacy removal, Phase A, AC alignment, publish auth, website RBAC, product isolation |
| Shared product (themes, media, editors, sections, booking, About 2.02, staff/scope) | **PASS** `109/109` | Includes `/about` unit **Version 2.02** |
| Security + image placement + UIE + directory + tenant isolation | **PASS** (after fixture fix) | AC patient-registration fixture phone corrected → `12/12`; isolation/forgery/media PASS |
| Chrome / structured / directory extras | **PASS with 2 P2 fails** `62/64` | `/c/…?website_edit=1` returns **301** (known); settings/403 isolation still PASS |
| AC services / doctors / booking recheck | **PASS** `20/20` | Service cards, doctor image, public + MF10 booking |
| AC `patient.create` alignment | **PASS** `8/8` | Reception/clinical/managers; self-elevation deny |

Logs: `/tmp/v202-final-reg/` (`core.txt`, `shared.txt`, `security.txt`, `ac-reg-fixed.txt`, `product-extra.txt`, `ac-booking-svc.txt`, `ac-align.txt`).

### Fixture fix during this pass (non-product)

`tests/activeclinic-patient-registration-rbac.test.js` used `+26097000001`-style phones that fail ZM E.164 (`97` + **7** digits). Seed `createFacility` returned `invalid_input` → 10 false fails. Fixed to `+26097#######`. **Not** an authorization regression.

---

## Requirement matrix

### PLATFORM

| Case | Automated | Hosted | Notes |
| --- | --- | --- | --- |
| Identity / login | PASS | SKIP tip | Session + identity suites in core/security |
| Platform admin | PASS | SKIP tip | Catalogue `platform_administrator` + `platform.*` |
| Roles / permissions | PASS | SKIP tip | Shared catalogue foundation |
| Assignment / revoke | PASS | SKIP tip | URA assign/revoke; expires_at filter |
| Suspended / revoked access | PASS | SKIP tip | Revoke → deny; suspended identity paths |

### BLESSBOARD

| Case | Automated | Hosted | Notes |
| --- | --- | --- | --- |
| Login | PASS | SKIP tip | Membership + catalogue assignment |
| Staff / access | PASS | SKIP tip | Shells + foundation |
| Catalogue roles | PASS | SKIP tip | No `user_roles` auth fallthrough |
| HQ / branch scope | PASS | SKIP tip | Scope resolver PASS; chrome `301` P2 |
| Website editor | PASS | SKIP tip | Shared editor + structured editors |
| Image placement | PASS | SKIP tip | Placement + UIE (390px CSS asserted) |
| Themes | PASS | SKIP tip | Gallery + infra |
| Publish | PASS | SKIP tip | P0 publish auth; editor cannot publish |
| Directory | PASS | SKIP tip | Directory publish eligibility |
| Structured content | PASS | SKIP tip | Structured draft editors |
| Mobile 390px | PASS (CSS/unit) | SKIP tip visual | UIE framing CSS; prior RNC shots on V8 testing |

### ACTIVECLINIC

| Case | Automated | Hosted | Notes |
| --- | --- | --- | --- |
| Registration / login | PASS | SKIP tip | Patient reg workflows + eligibility |
| Staff / access | PASS | SKIP tip | Staff RBAC foundation / multi-role |
| `patient.create` policy | PASS | SKIP tip | Alignment + registration RBAC |
| Services / doctors | PASS | SKIP tip | Service cards + doctor image |
| Booking | PASS | SKIP tip | Public + MF10 |
| Patient portal | PASS (covered in booking/auth suites) | SKIP tip | No separate portal suite in this matrix |
| Website editor | PASS | SKIP tip | CMS + shared editor |
| Themes | PASS | SKIP tip | Shared gallery |
| Image placement | PASS | SKIP tip | Shared placement / UIE |
| Publish | PASS | SKIP tip | Website RBAC + isolation |
| Mobile 390px | PASS (CSS/unit) | SKIP tip visual | Same shared UIE assertion |

### SECURITY

| Case | Automated | Hosted | Notes |
| --- | --- | --- | --- |
| Cross-product denial | PASS | SKIP tip | Tenant product isolation |
| Cross-tenant denial | PASS | SKIP tip | BB + AC HTTP/service |
| Cross-scope denial | PASS | SKIP tip | HQ/branch + facility |
| Direct API denial | PASS | SKIP tip | Publish 403; `/app/patients/new` |
| Forged IDs | PASS | SKIP tip | Instance/version/org swaps |
| Unauthorized publish | PASS | SKIP tip | Editor deny; foreign org deny |
| Foreign media denial | PASS | SKIP tip | Shared media resolution + isolation |
| Self-elevation prevention | PASS | SKIP tip | AC org-admin; BB sensitive assign |

### RELEASE

| Case | Local tip | Hosted V8 testing (`gitSha=b186991d7db5`) |
| --- | --- | --- |
| About = 2.02 both products | **PASS** (unit + buildInfo `2.02`) | **PASS** BB + AC `/about` show **Version 2.02** + build `b186991d7db5` |
| Release Notes = 2.02 both products | **PASS** catalog `VERSIONS` 2.02 with **LOCAL QA PASS / CONVERGED** (no “under development”) | **PASS** hub + BB + AC `/release-notes/2.02` **200**; hosted catalog text is older tip (no CONVERGED claim yet) |

---

## Hosted

| Environment | Result |
| --- | --- |
| Production | **DO NOT TOUCH** — not exercised |
| `moovex-platform-v8-testing` healthz | **PASS** BB/AC/hub `200`, `environment=testing` |
| Hosted SHA | **`b186991d7db5`** — **behind** V9 tip `fd2d6f8a` |
| About / RN 2.02 read-only | **PASS** (version label) |
| Full tip functional / RBAC hosted matrix | **SKIP** — tip not deployed; no mutate |

---

## Remaining issues

### Against this V9 / V2.02 candidate

| ID | Severity | Status | Notes |
| --- | --- | --- | --- |
| Open allow-when-deny auth | P0 | **None known** | Matrix green after fixture fix |
| Branch chrome `301` vs `200` | P2 test | Open | Redirect expectation; not auth grant |
| Display/`user_roles` dual-read soak | P2 | Open | Non-auth; drop table deferred |
| HQ role UI legacy labels | P2 | Open | Soak |
| Phase F `platform.roles` relocate | P2/P3 | Deferred | Explicit |

### Parallel / production-line (not introduced here; still block **production** promote)

| ID | Severity | Status |
| --- | --- | --- |
| **HOST-PKG-A** | P0 ops | Open |
| **Prod tip lag** (placement/themes) | P1 ops | Open until promote |
| **BACKUP-PROD-VERIFY** | P0/P1 ops | Unknown |
| **V8-001** email delivery | P1 ops | Open |
| Hosted V9 tip deploy + RBAC smoke | P1 ops | Pending |
| Uncommitted tip commit | Process | Owner when ready |

---

## Evidence commands (local)

```bash
node --test \
  tests/v2-02-platform-rbac-foundation.test.js \
  tests/v2-02-bb-catalogue-only-rbac.test.js \
  tests/v2-02-platform-admin-rbac-convergence.test.js \
  tests/v2-02-legacy-rbac-removal.test.js \
  tests/v2-02-ac-rbac-alignment.test.js \
  tests/v2-02-phase-a-user-roles-backfill.test.js \
  tests/v8-shared-rbac-tenant-isolation.test.js \
  tests/v8-tenant-product-isolation.test.js \
  tests/blessboard-authorization-shells.test.js \
  tests/blessboard-rbac-foundation.test.js \
  tests/blessboard-finance-separation.test.js \
  tests/blessboard-p0-publish-auth.test.js \
  tests/v7-website-rbac.test.js \
  tests/activeclinic-rbac-role-matrix.test.js
# → 124/124

node --test tests/activeclinic-patient-registration-rbac.test.js
# → 12/12 (after ZM phone fixture fix)
```

Hosted read-only (no mutate):

```bash
curl -sS https://blessboard.neuniversity.org/healthz   # gitSha b186991d7db5
curl -sS https://activeclinic.neuniversity.org/about   # Version 2.02
curl -sS https://blessboard.neuniversity.org/release-notes/2.02
```

---

## Return token

```
V2_02_FINAL_REGRESSION_PASS
branch=V9
sha=fd2d6f8abf98d063ef0d0e25182130d1b7f193b2
write_tree=c2a14d57825a890649aaf0961f305bbbbc2dac99
automated=PASS_core_124_shared_109_ac_reg_12_security_isolation_PASS
automated_p2_fail=chrome_301_x2
hosted_about_rn_2_02=PASS
hosted_tip_sha=b186991d7db5_behind_tip
hosted_full_matrix=SKIP
p0_auth=none
prod_untouched=YES
```
