# ActiveClinic + BlessBoard
# Version 2.03
# 98 Automated QA Scenarios
# Manual QA Handoff

## Release identity

- **Release SHA:** `5e2e77074ee6375834a9089a306df5d5c383aea9`
- **Automated QA:** **98 / 98 PASS**
- **Canonical tests:** 7276 cases · 6792 pass · 0 fail · 484 skip · 0 cancelled
- **P0=0 · P1=0**
- **Production:** UNTOUCHED

## Authoritative source

These **exactly 98** scenarios are recovered from the V2.03 QA automation matrix and the final release-gate execution evidence. **No scenarios were invented.**

| Source | Role |
|---|---|
| `docs/qa/V2_03_QA_AUTOMATION_MATRIX.md` | Scenario definitions (ACTION / EXPECTED / PRECONDITION / TEST_FILE) |
| `/tmp/v203-final-qa-release/qa/qa-id-results.json` | Final gate `QA_PASSING=98/98` |
| `/tmp/v203-final-qa-release/qa/execution-ledger.json` | Per-QA_ID file mapping (incl. `BB-V203-REG` npm pack, `AC-V203-E2E` journey) |
| `docs/qa/V2_03_FINAL_QA_RELEASE_GATE.md` | Release gate census |

```text
TOTAL_SCENARIOS=98
PLATFORM_SHARED=34  (SHARED=27 + PLATFORM=7)
BLESSBOARD=30
ACTIVECLINIC=34
PASS=98
FAIL=0
SKIPPED=0
DUPLICATE_QA_IDS=0
UNTRACEABLE_SCENARIOS=0
INVENTED_SCENARIOS=0
```

Companion machine-readable file: `docs/qa/V2_03_98_AUTOMATED_QA_SCENARIOS.json`

---

## PART A — PLATFORM / SHARED

_Scenarios in this part: **34**_

### QA-001 — auth/login — GET /login
**QA_ID:** `SH-AUTH-01`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Authentication  
**Automated Status:** PASS

**Objective:**  
GET /login → 200 login form

**Preconditions:**  
- Role/context: anonymous
- valid product host

**Automated Verification:**  
GET /login

**Expected Result:**  
200 login form

**Security / Isolation:**  
Standard authenticated/public contract as stated in expected result; no widening of authz.

**Automation Evidence:**
- Test file(s): `tests/v8-shared-auth-password-security.test.js; tests/blessboard-auth-http.test.js; tests/activeclinic-acw08-auth.test.js`
- Test/mapping: `v8-shared-auth-password-security.test.js; blessboard-auth-http.test.js; activeclinic-acw08-auth.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: valid product host.
3. Perform action: GET /login.
4. Confirm outcome matches: 200 login form.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-002 — auth/login — POST /login
**QA_ID:** `SH-AUTH-02`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Authentication  
**Automated Status:** PASS

**Objective:**  
POST /login → 303 + session cookie

**Preconditions:**  
- Role/context: member/staff
- valid credentials

**Automated Verification:**  
POST /login

**Expected Result:**  
303 + session cookie

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v8-shared-session-security.test.js; tests/blessboard-phone-login.test.js; tests/activeclinic-acw08-auth.test.js; tests/v8-shared-auth-password-security.test.js`
- Test/mapping: `v8-shared-session-security.test.js; blessboard-phone-login.test.js; activeclinic-acw08-auth.test.js; v8-shared-auth-password-security.test.js`

**Manual QA Steps:**
1. Use role/context: member/staff.
2. Establish precondition: valid credentials.
3. Perform action: POST /login.
4. Confirm outcome matches: 303 + session cookie.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-003 — auth/login — POST /login
**QA_ID:** `SH-AUTH-03`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Authentication  
**Automated Status:** PASS

**Objective:**  
POST /login → 401/controlled deny; no session

**Preconditions:**  
- Role/context: attacker
- wrong password

**Automated Verification:**  
POST /login

**Expected Result:**  
401/controlled deny; no session

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v8-shared-auth-password-security.test.js; tests/activeclinic-acw08-auth.test.js`
- Test/mapping: `v8-shared-auth-password-security.test.js; activeclinic-acw08-auth.test.js`

**Manual QA Steps:**
1. Use role/context: attacker.
2. Establish precondition: wrong password.
3. Perform action: POST /login.
4. Confirm outcome matches: 401/controlled deny; no session.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-004 — auth/login — POST /logout
**QA_ID:** `SH-AUTH-04`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Authentication  
**Automated Status:** PASS

**Objective:**  
POST /logout → session terminated; subsequent protected 401/303

**Preconditions:**  
- Role/context: staff
- valid session

**Automated Verification:**  
POST /logout

**Expected Result:**  
session terminated; subsequent protected 401/303

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-logout-after-switch.test.js; tests/v8-shared-session-security.test.js; tests/blessboard-auth-http.test.js; tests/blessboard-auth-schema.test.js`
- Test/mapping: `activeclinic-logout-after-switch.test.js; v8-shared-session-security.test.js; blessboard-auth-http.test.js; blessboard-auth-schema.test.js`

**Manual QA Steps:**
1. Use role/context: staff.
2. Establish precondition: valid session.
3. Perform action: POST /logout.
4. Confirm outcome matches: session terminated; subsequent protected 401/303.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-005 — auth/login — login on foreign product host
**QA_ID:** `SH-AUTH-05`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Authentication  
**Automated Status:** PASS

**Objective:**  
login on foreign product host → no session leakage / product-correct shell

**Preconditions:**  
- Role/context: anonymous
- cross-product host

**Automated Verification:**  
login on foreign product host

**Expected Result:**  
no session leakage / product-correct shell

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-unified-login.test.js; tests/v7-runtime-env-isolation.test.js; tests/v8-tenant-product-isolation.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `activeclinic-unified-login.test.js; v7-runtime-env-isolation.test.js; v8-tenant-product-isolation.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: cross-product host.
3. Perform action: login on foreign product host.
4. Confirm outcome matches: no session leakage / product-correct shell.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-006 — phone/email identity — submit phone_country+phone_national
**QA_ID:** `SH-ID-01`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Authentication  
**Automated Status:** PASS

**Objective:**  
submit phone_country+phone_national → normalized E.164 stored; invalid rejected

**Preconditions:**  
- Role/context: registrant
- ZM/KE national fields

**Automated Verification:**  
submit phone_country+phone_national

**Expected Result:**  
normalized E.164 stored; invalid rejected

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v7-shared-phone-identity.test.js; tests/v7-bb-ac-phone-parity.test.js; tests/blessboard-registration-phone.test.js`
- Test/mapping: `v7-shared-phone-identity.test.js; v7-bb-ac-phone-parity.test.js; blessboard-registration-phone.test.js`

**Manual QA Steps:**
1. Use role/context: registrant.
2. Establish precondition: ZM/KE national fields.
3. Perform action: submit phone_country+phone_national.
4. Confirm outcome matches: normalized E.164 stored; invalid rejected.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-007 — phone/email identity — verify / resend flows
**QA_ID:** `SH-ID-02`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Authentication  
**Automated Status:** PASS

**Objective:**  
verify / resend flows → token verify activates; invalid token denied

**Preconditions:**  
- Role/context: registrant
- email verification required

**Automated Verification:**  
verify / resend flows

**Expected Result:**  
token verify activates; invalid token denied

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v8-shared-verification.test.js; tests/blessboard-registration-email-verification-delivery.test.js; tests/blessboard-registration-email-verification-message.test.js; tests/blessboard-registration-email-verification-public-route.test.js`
- Test/mapping: `v8-shared-verification.test.js; blessboard-registration-email-verification-delivery.test.js; blessboard-registration-email-verification-message.test.js; blessboard-registration-email-verification-public-route.test.js`

**Manual QA Steps:**
1. Use role/context: registrant.
2. Establish precondition: email verification required.
3. Perform action: verify / resend flows.
4. Confirm outcome matches: token verify activates; invalid token denied.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-008 — phone/email identity — authenticate by phone
**QA_ID:** `SH-ID-03`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Authentication  
**Automated Status:** PASS

**Objective:**  
authenticate by phone → login succeeds without inventing OTP

**Preconditions:**  
- Role/context: staff
- phone-first login

**Automated Verification:**  
authenticate by phone

**Expected Result:**  
login succeeds without inventing OTP

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-phone-login.test.js; tests/v7-shared-phone-identity.test.js; tests/activeclinic-mf-identity.test.js`
- Test/mapping: `blessboard-phone-login.test.js; v7-shared-phone-identity.test.js; activeclinic-mf-identity.test.js`

**Manual QA Steps:**
1. Use role/context: staff.
2. Establish precondition: phone-first login.
3. Perform action: authenticate by phone.
4. Confirm outcome matches: login succeeds without inventing OTP.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-009 — registration — start registration wizard
**QA_ID:** `SH-REG-01`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Registration  
**Automated Status:** PASS

**Objective:**  
start registration wizard → shared consent field registration_consent required

**Preconditions:**  
- Role/context: anonymous
- unified registration engine

**Automated Verification:**  
start registration wizard

**Expected Result:**  
shared consent field registration_consent required

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v7-unified-registration-engine.test.js`
- Test/mapping: `v7-unified-registration-engine.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: unified registration engine.
3. Perform action: start registration wizard.
4. Confirm outcome matches: shared consent field registration_consent required.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-010 — registration — re-submit registration
**QA_ID:** `SH-REG-02`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Registration  
**Automated Status:** PASS

**Objective:**  
re-submit registration → controlled deny or idempotent reuse per product contract

**Preconditions:**  
- Role/context: anonymous
- duplicate email/phone

**Automated Verification:**  
re-submit registration

**Expected Result:**  
controlled deny or idempotent reuse per product contract

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-instant-free-registration.test.js; tests/activeclinic-clinic-onboarding.test.js; tests/activeclinic-registration-identity-idempotency.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `blessboard-instant-free-registration.test.js; activeclinic-clinic-onboarding.test.js; activeclinic-registration-identity-idempotency.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: duplicate email/phone.
3. Perform action: re-submit registration.
4. Confirm outcome matches: controlled deny or idempotent reuse per product contract.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-011 — tenant isolation — access org B resource with org A session
**QA_ID:** `SH-TEN-01`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Tenant Isolation  
**Automated Status:** PASS

**Objective:**  
access org B resource with org A session → 403/404; no data leak

**Preconditions:**  
- Role/context: staff A
- two orgs provisioned

**Automated Verification:**  
access org B resource with org A session

**Expected Result:**  
403/404; no data leak

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v8-shared-rbac-tenant-isolation.test.js; tests/v8-tenant-product-isolation.test.js; tests/v10-pc02-platform-consolidation-characterization.test.js`
- Test/mapping: `v8-shared-rbac-tenant-isolation.test.js; v8-tenant-product-isolation.test.js; v10-pc02-platform-consolidation-characterization.test.js`

**Manual QA Steps:**
1. Use role/context: staff A.
2. Establish precondition: two orgs provisioned.
3. Perform action: access org B resource with org A session.
4. Confirm outcome matches: 403/404; no data leak.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-012 — tenant isolation — POST mutation
**QA_ID:** `SH-TEN-02`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Tenant Isolation  
**Automated Status:** PASS

**Objective:**  
POST mutation → 403/deny; no write

**Preconditions:**  
- Role/context: staff
- forged organization_id in body

**Automated Verification:**  
POST mutation

**Expected Result:**  
403/deny; no write

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v10-pc02-platform-consolidation-characterization.test.js; tests/v8-shared-rbac-tenant-isolation.test.js; tests/activeclinic-batch2-rbac-isolation.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `v10-pc02-platform-consolidation-characterization.test.js; v8-shared-rbac-tenant-isolation.test.js; activeclinic-batch2-rbac-isolation.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: staff.
2. Establish precondition: forged organization_id in body.
3. Perform action: POST mutation.
4. Confirm outcome matches: 403/deny; no write.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-013 — RBAC — access privileged route
**QA_ID:** `SH-RBAC-01`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** RBAC / Access Control  
**Automated Status:** PASS

**Objective:**  
access privileged route → 403 deny

**Preconditions:**  
- Role/context: wrong role
- authenticated non-privileged

**Automated Verification:**  
access privileged route

**Expected Result:**  
403 deny

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed. Role catalogue authorization enforced; privilege escalation denied.

**Automation Evidence:**
- Test file(s): `tests/v8-shared-rbac-tenant-isolation.test.js; tests/blessboard-authorization.test.js; tests/activeclinic-batch2-rbac-isolation.test.js`
- Test/mapping: `v8-shared-rbac-tenant-isolation.test.js; blessboard-authorization.test.js; activeclinic-batch2-rbac-isolation.test.js`

**Manual QA Steps:**
1. Use role/context: wrong role.
2. Establish precondition: authenticated non-privileged.
3. Perform action: access privileged route.
4. Confirm outcome matches: 403 deny.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-014 — RBAC — authorize without legacy user_roles
**QA_ID:** `SH-RBAC-02`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** RBAC / Access Control  
**Automated Status:** PASS

**Objective:**  
authorize without legacy user_roles → catalogue path authorizes; legacy alone does not

**Preconditions:**  
- Role/context: platform_admin
- catalogue assignment only

**Automated Verification:**  
authorize without legacy user_roles

**Expected Result:**  
catalogue path authorizes; legacy alone does not

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed. Role catalogue authorization enforced; privilege escalation denied.

**Automation Evidence:**
- Test file(s): `tests/v2-02-bb-catalogue-only-rbac.test.js; tests/v2-02-legacy-rbac-removal.test.js; tests/v2-02-platform-admin-rbac-convergence.test.js`
- Test/mapping: `v2-02-bb-catalogue-only-rbac.test.js; v2-02-legacy-rbac-removal.test.js; v2-02-platform-admin-rbac-convergence.test.js`

**Manual QA Steps:**
1. Use role/context: platform_admin.
2. Establish precondition: catalogue assignment only.
3. Perform action: authorize without legacy user_roles.
4. Confirm outcome matches: catalogue path authorizes; legacy alone does not.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-015 — media upload — upload image via shared media field
**QA_ID:** `SH-MED-01`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Media / Uploads  
**Automated Status:** PASS

**Objective:**  
upload image via shared media field → asset persisted; kill-switch honored

**Preconditions:**  
- Role/context: editor
- website.edit grant

**Automated Verification:**  
upload image via shared media field

**Expected Result:**  
asset persisted; kill-switch honored

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed. Media scoped to tenant; CSRF and kill-switch honored where applicable.

**Automation Evidence:**
- Test file(s): `tests/v10-pc08-platform-media-consolidation.test.js; tests/v2-shared-media-upload-parity.test.js; tests/blessboard-media.test.js; tests/activeclinic-pass6-media.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `v10-pc08-platform-media-consolidation.test.js; v2-shared-media-upload-parity.test.js; blessboard-media.test.js; activeclinic-pass6-media.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: website.edit grant.
3. Perform action: upload image via shared media field.
4. Confirm outcome matches: asset persisted; kill-switch honored.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-016 — media library — open Content/Image Library picker
**QA_ID:** `SH-MED-02`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Media / Uploads  
**Automated Status:** PASS

**Objective:**  
open Content/Image Library picker → list scoped assets; select applies to draft

**Preconditions:**  
- Role/context: editor
- existing assets

**Automated Verification:**  
open Content/Image Library picker

**Expected Result:**  
list scoped assets; select applies to draft

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed. Media scoped to tenant; CSRF and kill-switch honored where applicable.

**Automation Evidence:**
- Test file(s): `tests/v2-shared-media-upload-parity.test.js; tests/v2-01-universal-image-editor.test.js; tests/blessboard-media.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `v2-shared-media-upload-parity.test.js; v2-01-universal-image-editor.test.js; blessboard-media.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: existing assets.
3. Perform action: open Content/Image Library picker.
4. Confirm outcome matches: list scoped assets; select applies to draft.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-017 — media library — select/use foreign media
**QA_ID:** `SH-MED-03`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Media / Uploads  
**Automated Status:** PASS

**Objective:**  
select/use foreign media → deny / no cross-tenant URL

**Preconditions:**  
- Role/context: wrong tenant
- foreign asset id

**Automated Verification:**  
select/use foreign media

**Expected Result:**  
deny / no cross-tenant URL

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed. Media scoped to tenant; CSRF and kill-switch honored where applicable.

**Automation Evidence:**
- Test file(s): `tests/blessboard-media.test.js; tests/v8-tenant-product-isolation.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `blessboard-media.test.js; v8-tenant-product-isolation.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: wrong tenant.
2. Establish precondition: foreign asset id.
3. Perform action: select/use foreign media.
4. Confirm outcome matches: deny / no cross-tenant URL.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-018 — publish/unpublish — publish website
**QA_ID:** `SH-PUB-01`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Publishing  
**Automated Status:** PASS

**Objective:**  
publish website → published version; public reflects content

**Preconditions:**  
- Role/context: publisher
- draft changes exist

**Automated Verification:**  
publish website

**Expected Result:**  
published version; public reflects content

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed. Publish requires grant; unauthorized publish leaves draft/public unchanged.

**Automation Evidence:**
- Test file(s): `tests/v10-pc10-publication-convergence.test.js; tests/v10-pc10b-ac-website-workflow-baseline.test.js; tests/v10-pc10b-bb-publish-baselines.test.js; tests/blessboard-p0-publish-auth.test.js`
- Test/mapping: `v10-pc10-publication-convergence.test.js; v10-pc10b-ac-website-workflow-baseline.test.js; v10-pc10b-bb-publish-baselines.test.js; blessboard-p0-publish-auth.test.js`

**Manual QA Steps:**
1. Use role/context: publisher.
2. Establish precondition: draft changes exist.
3. Perform action: publish website.
4. Confirm outcome matches: published version; public reflects content.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-019 — publish/unpublish — POST publish
**QA_ID:** `SH-PUB-02`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Publishing  
**Automated Status:** PASS

**Objective:**  
POST publish → 403; draft unchanged

**Preconditions:**  
- Role/context: editor-only
- no publish grant

**Automated Verification:**  
POST publish

**Expected Result:**  
403; draft unchanged

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed. Publish requires grant; unauthorized publish leaves draft/public unchanged.

**Automation Evidence:**
- Test file(s): `tests/blessboard-p0-publish-auth.test.js; tests/v10-pc10b-ac-website-workflow-baseline.test.js`
- Test/mapping: `blessboard-p0-publish-auth.test.js; v10-pc10b-ac-website-workflow-baseline.test.js`

**Manual QA Steps:**
1. Use role/context: editor-only.
2. Establish precondition: no publish grant.
3. Perform action: POST publish.
4. Confirm outcome matches: 403; draft unchanged.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-020 — draft/reload — reload editor/preview
**QA_ID:** `SH-DFT-01`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Website Editing  
**Automated Status:** PASS

**Objective:**  
reload editor/preview → draft retained; live unchanged until publish

**Preconditions:**  
- Role/context: editor
- draft saved

**Automated Verification:**  
reload editor/preview

**Expected Result:**  
draft retained; live unchanged until publish

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v7-website-draft-live-integrity.test.js; tests/v2-01-unpublished-changes-panel.test.js; tests/phase3-website-approval-settings.test.js; tests/phase3-website-audit-log.test.js`
- Test/mapping: `v7-website-draft-live-integrity.test.js; v2-01-unpublished-changes-panel.test.js; phase3-website-approval-settings.test.js; phase3-website-audit-log.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: draft saved.
3. Perform action: reload editor/preview.
4. Confirm outcome matches: draft retained; live unchanged until publish.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-021 — website editing — edit text field → save draft
**QA_ID:** `SH-WE-01`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Website Editing  
**Automated Status:** PASS

**Objective:**  
edit text field → save draft → HTTP save; draft persists; public unchanged

**Preconditions:**  
- Role/context: editor
- inline edit chrome

**Automated Verification:**  
edit text field → save draft

**Expected Result:**  
HTTP save; draft persists; public unchanged

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v7-shared-website-editor.test.js; tests/v2-01-bb-inline-editor-parity.test.js; tests/shared-website-editor-wave1.test.js; tests/shared-website-editor-wave2.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `v7-shared-website-editor.test.js; v2-01-bb-inline-editor-parity.test.js; shared-website-editor-wave1.test.js; shared-website-editor-wave2.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: inline edit chrome.
3. Perform action: edit text field → save draft.
4. Confirm outcome matches: HTTP save; draft persists; public unchanged.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-022 — website editing — add/reorder/remove section
**QA_ID:** `SH-WE-02`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Website Editing  
**Automated Status:** PASS

**Objective:**  
add/reorder/remove section → draft structure updated

**Preconditions:**  
- Role/context: editor
- section management

**Automated Verification:**  
add/reorder/remove section

**Expected Result:**  
draft structure updated

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v2-01-shared-section-management.test.js; tests/v2-bb-leadership-section-management.test.js`
- Test/mapping: `v2-01-shared-section-management.test.js; v2-bb-leadership-section-management.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: section management.
3. Perform action: add/reorder/remove section.
4. Confirm outcome matches: draft structure updated.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-023 — image placement — open framing → place → save
**QA_ID:** `SH-IMG-01`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Image Editing  
**Automated Status:** PASS

**Objective:**  
open framing → place → save → placement persisted via platform helpers

**Preconditions:**  
- Role/context: editor
- universal image editor

**Automated Verification:**  
open framing → place → save

**Expected Result:**  
placement persisted via platform helpers

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v2-01-universal-image-editor.test.js; tests/v2-02-universal-image-editor-coverage.test.js; tests/v2-02-structured-image-framing-lifecycle.test.js`
- Test/mapping: `v2-01-universal-image-editor.test.js; v2-02-universal-image-editor-coverage.test.js; v2-02-structured-image-framing-lifecycle.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: universal image editor.
3. Perform action: open framing → place → save.
4. Confirm outcome matches: placement persisted via platform helpers.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-024 — image placement — framing on leadership/sermon/ministry
**QA_ID:** `SH-IMG-02`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Image Editing  
**Automated Status:** PASS

**Objective:**  
framing on leadership/sermon/ministry → no duplicated framing engine

**Preconditions:**  
- Role/context: editor
- structured Category A mounts

**Automated Verification:**  
framing on leadership/sermon/ministry

**Expected Result:**  
no duplicated framing engine

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v2-02-structured-image-framing-lifecycle.test.js; tests/v2-bb-ministry-image-edit.test.js; tests/v2-bb-ministry-leader-image.test.js; tests/v2-bb-sermon-image-persistence.test.js`
- Test/mapping: `v2-02-structured-image-framing-lifecycle.test.js; v2-bb-ministry-image-edit.test.js; v2-bb-ministry-leader-image.test.js; v2-bb-sermon-image-persistence.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: structured Category A mounts.
3. Perform action: framing on leadership/sermon/ministry.
4. Confirm outcome matches: no duplicated framing engine.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-025 — version/about — GET version/about surfaces
**QA_ID:** `SH-VER-01`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Other verified V2.03 areas  
**Automated Status:** PASS

**Objective:**  
GET version/about surfaces → version notes render; no secrets

**Preconditions:**  
- Role/context: anonymous
- product host

**Automated Verification:**  
GET version/about surfaces

**Expected Result:**  
version notes render; no secrets

**Security / Isolation:**  
Standard authenticated/public contract as stated in expected result; no widening of authz.

**Automation Evidence:**
- Test file(s): `tests/v2-01-release-notes-center.test.js; tests/v7-getpro-testing-foundation.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `v2-01-release-notes-center.test.js; v7-getpro-testing-foundation.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: product host.
3. Perform action: GET version/about surfaces.
4. Confirm outcome matches: version notes render; no secrets.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-026 — domain/product routing — resolve product by Host
**QA_ID:** `SH-HOST-01`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Other verified V2.03 areas  
**Automated Status:** PASS

**Objective:**  
resolve product by Host → correct productKey; line match v8 testing

**Preconditions:**  
- Role/context: anonymous
- canonical *.pronline.org hosts

**Automated Verification:**  
resolve product by Host

**Expected Result:**  
correct productKey; line match v8 testing

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v7-runtime-env-isolation.test.js; tests/activeclinic-unified-login.test.js; tests/v7-domain-resolved-platform.test.js`
- Test/mapping: `v7-runtime-env-isolation.test.js; activeclinic-unified-login.test.js; v7-domain-resolved-platform.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: canonical *.pronline.org hosts.
3. Perform action: resolve product by Host.
4. Confirm outcome matches: correct productKey; line match v8 testing.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-027 — domain/product routing — GET /
**QA_ID:** `SH-HOST-02`  
**Product:** PLATFORM / SHARED (`SHARED`)  
**Functional Area:** Other verified V2.03 areas  
**Automated Status:** PASS

**Objective:**  
GET / → 421 / environment mismatch

**Preconditions:**  
- Role/context: anonymous
- production host on testing runtime

**Automated Verification:**  
GET /

**Expected Result:**  
421 / environment mismatch

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v7-runtime-env-isolation.test.js; tests/v7-getpro-testing-foundation.test.js`
- Test/mapping: `v7-runtime-env-isolation.test.js; v7-getpro-testing-foundation.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: production host on testing runtime.
3. Perform action: GET /.
4. Confirm outcome matches: 421 / environment mismatch.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-092 — migrations/bootstrap — bootstrap + migrate + verify
**QA_ID:** `PL-DB-01`  
**Product:** PLATFORM / SHARED (`PLATFORM`)  
**Functional Area:** Other verified V2.03 areas  
**Automated Status:** PASS

**Objective:**  
bootstrap + migrate + verify → foundation schemas/seeds; idempotent

**Preconditions:**  
- Role/context: CI
- empty Postgres

**Automated Verification:**  
bootstrap + migrate + verify

**Expected Result:**  
foundation schemas/seeds; idempotent

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/db-bootstrap-foundation.test.js; tests/db-foundation.test.js; tests/v10-dbcl11-post-cleanup-fresh-bootstrap.test.js`
- Test/mapping: `db-bootstrap-foundation.test.js; db-foundation.test.js; v10-dbcl11-post-cleanup-fresh-bootstrap.test.js`

**Manual QA Steps:**
1. Use role/context: CI.
2. Establish precondition: empty Postgres.
3. Perform action: bootstrap + migrate + verify.
4. Confirm outcome matches: foundation schemas/seeds; idempotent.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-093 — migrations/bootstrap — apply migration pipeline
**QA_ID:** `PL-DB-02`  
**Product:** PLATFORM / SHARED (`PLATFORM`)  
**Functional Area:** Other verified V2.03 areas  
**Automated Status:** PASS

**Objective:**  
apply migration pipeline → catalogue roles written; user_roles frozen

**Preconditions:**  
- Role/context: ops
- v4→v5 tooling

**Automated Verification:**  
apply migration pipeline

**Expected Result:**  
catalogue roles written; user_roles frozen

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/migration-tooling.test.js; tests/v5-to-v7-migration-tooling.test.js`
- Test/mapping: `migration-tooling.test.js; v5-to-v7-migration-tooling.test.js`

**Manual QA Steps:**
1. Use role/context: ops.
2. Establish precondition: v4→v5 tooling.
3. Perform action: apply migration pipeline.
4. Confirm outcome matches: catalogue roles written; user_roles frozen.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-094 — platform admin — tenant health / admin routes
**QA_ID:** `PL-ADM-01`  
**Product:** PLATFORM / SHARED (`PLATFORM`)  
**Functional Area:** RBAC / Access Control  
**Automated Status:** PASS

**Objective:**  
tenant health / admin routes → authorized; forged org denied

**Preconditions:**  
- Role/context: platform_administrator
- support/ops

**Automated Verification:**  
tenant health / admin routes

**Expected Result:**  
authorized; forged org denied

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v7-platform-admin-tenant-health.test.js; tests/v7-platform-admin-website-control.test.js; tests/blessboard-announcement-platform-admin-testing-policy.test.js; tests/blessboard-platform-admin-directory.test.js`
- Test/mapping: `v7-platform-admin-tenant-health.test.js; v7-platform-admin-website-control.test.js; blessboard-announcement-platform-admin-testing-policy.test.js; blessboard-platform-admin-directory.test.js`

**Manual QA Steps:**
1. Use role/context: platform_administrator.
2. Establish precondition: support/ops.
3. Perform action: tenant health / admin routes.
4. Confirm outcome matches: authorized; forged org denied.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-095 — entitlements — staff seat counting via URA
**QA_ID:** `PL-ENT-01`  
**Product:** PLATFORM / SHARED (`PLATFORM`)  
**Functional Area:** RBAC / Access Control  
**Automated Status:** PASS

**Objective:**  
staff seat counting via URA → limits enforced for non-platform roles

**Preconditions:**  
- Role/context: org
- plan seats

**Automated Verification:**  
staff seat counting via URA

**Expected Result:**  
limits enforced for non-platform roles

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/platform-entitlements.test.js; tests/phase4-website-plan-entitlements.test.js`
- Test/mapping: `platform-entitlements.test.js; phase4-website-plan-entitlements.test.js`

**Manual QA Steps:**
1. Use role/context: org.
2. Establish precondition: plan seats.
3. Perform action: staff seat counting via URA.
4. Confirm outcome matches: limits enforced for non-platform roles.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-096 — publication convergence — BB/AC publish baselines
**QA_ID:** `PL-PUB-01`  
**Product:** PLATFORM / SHARED (`PLATFORM`)  
**Functional Area:** Publishing  
**Automated Status:** PASS

**Objective:**  
BB/AC publish baselines → PC10B green historically

**Preconditions:**  
- Role/context: CI
- PC10 baselines

**Automated Verification:**  
BB/AC publish baselines

**Expected Result:**  
PC10B green historically

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed. Publish requires grant; unauthorized publish leaves draft/public unchanged.

**Automation Evidence:**
- Test file(s): `tests/v10-pc10b-ac-website-workflow-baseline.test.js; tests/v10-pc10b-bb-publish-baselines.test.js; tests/v10-pc10-publication-convergence.test.js`
- Test/mapping: `v10-pc10b-ac-website-workflow-baseline.test.js; v10-pc10b-bb-publish-baselines.test.js; v10-pc10-publication-convergence.test.js`

**Manual QA Steps:**
1. Use role/context: CI.
2. Establish precondition: PC10 baselines.
3. Perform action: BB/AC publish baselines.
4. Confirm outcome matches: PC10B green historically.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-097 — media consolidation — shared media folders/library
**QA_ID:** `PL-MED-01`  
**Product:** PLATFORM / SHARED (`PLATFORM`)  
**Functional Area:** Media / Uploads  
**Automated Status:** PASS

**Objective:**  
shared media folders/library → consolidation characterization

**Preconditions:**  
- Role/context: CI
- PC08

**Automated Verification:**  
shared media folders/library

**Expected Result:**  
consolidation characterization

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed. Media scoped to tenant; CSRF and kill-switch honored where applicable.

**Automation Evidence:**
- Test file(s): `tests/v10-pc08-platform-media-consolidation.test.js`
- Test/mapping: `v10-pc08-platform-media-consolidation.test.js`

**Manual QA Steps:**
1. Use role/context: CI.
2. Establish precondition: PC08.
3. Perform action: shared media folders/library.
4. Confirm outcome matches: consolidation characterization.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-098 — security — authz+publish+isolation
**QA_ID:** `PL-SEC-01`  
**Product:** PLATFORM / SHARED (`PLATFORM`)  
**Functional Area:** Tenant Isolation  
**Automated Status:** PASS

**Objective:**  
authz+publish+isolation → V203 critical platform coverage

**Preconditions:**  
- Role/context: CI
- critical pack

**Automated Verification:**  
authz+publish+isolation

**Expected Result:**  
V203 critical platform coverage

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v8-shared-rbac-tenant-isolation.test.js; tests/blessboard-p0-publish-auth.test.js`
- Test/mapping: `v8-shared-rbac-tenant-isolation.test.js; blessboard-p0-publish-auth.test.js`

**Manual QA Steps:**
1. Use role/context: CI.
2. Establish precondition: critical pack.
3. Perform action: authz+publish+isolation.
4. Confirm outcome matches: V203 critical platform coverage.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

## PART B — BLESSBOARD

_Scenarios in this part: **30**_

### QA-028 — church registration — register Foundation/instant free
**QA_ID:** `BB-REG-01`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Registration  
**Automated Status:** PASS

**Objective:**  
register Foundation/instant free → 303 success; org+church+HQ branch+sub provisioned

**Preconditions:**  
- Role/context: anonymous
- blessboard.org

**Automated Verification:**  
register Foundation/instant free

**Expected Result:**  
303 success; org+church+HQ branch+sub provisioned

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-instant-free-registration.test.js; tests/blessboard-register-church.test.js`
- Test/mapping: `blessboard-instant-free-registration.test.js; blessboard-register-church.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: blessboard.org.
3. Perform action: register Foundation/instant free.
4. Confirm outcome matches: 303 success; org+church+HQ branch+sub provisioned.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-029 — church registration — register Growth trial
**QA_ID:** `BB-REG-02`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Registration  
**Automated Status:** PASS

**Objective:**  
register Growth trial → trialing subscription; ready success

**Preconditions:**  
- Role/context: anonymous
- Growth plan

**Automated Verification:**  
register Growth trial

**Expected Result:**  
trialing subscription; ready success

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-growth-trial-registration.test.js`
- Test/mapping: `blessboard-growth-trial-registration.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: Growth plan.
3. Perform action: register Growth trial.
4. Confirm outcome matches: trialing subscription; ready success.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-030 — church registration — register Network
**QA_ID:** `BB-REG-03`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Registration  
**Automated Status:** PASS

**Objective:**  
register Network → enquiry / non-instant path

**Preconditions:**  
- Role/context: anonymous
- Network plan

**Automated Verification:**  
register Network

**Expected Result:**  
enquiry / non-instant path

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-network-support-registration.test.js; tests/blessboard-growth-trial-expiry.test.js; tests/blessboard-growth-trial-offer.test.js; tests/blessboard-growth-trial-registration.test.js`
- Test/mapping: `blessboard-network-support-registration.test.js; blessboard-growth-trial-expiry.test.js; blessboard-growth-trial-offer.test.js; blessboard-growth-trial-registration.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: Network plan.
3. Perform action: register Network.
4. Confirm outcome matches: enquiry / non-instant path.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-031 — church registration — submit risky registration
**QA_ID:** `BB-REG-04`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Registration  
**Automated Status:** PASS

**Objective:**  
submit risky registration → review_required or controlled path

**Preconditions:**  
- Role/context: anonymous
- risk signals

**Automated Verification:**  
submit risky registration

**Expected Result:**  
review_required or controlled path

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-registration-risk-review.test.js; tests/blessboard-registration-operator-approval.test.js`
- Test/mapping: `blessboard-registration-risk-review.test.js; blessboard-registration-operator-approval.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: risk signals.
3. Perform action: submit risky registration.
4. Confirm outcome matches: review_required or controlled path.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-032 — church registration — approve / reject / request info
**QA_ID:** `BB-REG-05`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Registration  
**Automated Status:** PASS

**Objective:**  
approve / reject / request info → status transitions; invitation where required

**Preconditions:**  
- Role/context: operator
- pending application

**Automated Verification:**  
approve / reject / request info

**Expected Result:**  
status transitions; invitation where required

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-registration-approval-checklist-ui.test.js; tests/blessboard-registration-approval-checklist.test.js; tests/blessboard-registration-approval-flow-ui.test.js; tests/blessboard-registration-approval-invitation.test.js`
- Test/mapping: `blessboard-registration-approval-checklist-ui.test.js; blessboard-registration-approval-checklist.test.js; blessboard-registration-approval-flow-ui.test.js; blessboard-registration-approval-invitation.test.js`

**Manual QA Steps:**
1. Use role/context: operator.
2. Establish precondition: pending application.
3. Perform action: approve / reject / request info.
4. Confirm outcome matches: status transitions; invitation where required.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-033 — HQ/branch behavior — GET /hq
**QA_ID:** `BB-HQ-01`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Church / Branch Management  
**Automated Status:** PASS

**Objective:**  
GET /hq → 200 HQ shell

**Preconditions:**  
- Role/context: organisation_administrator
- own church

**Automated Verification:**  
GET /hq

**Expected Result:**  
200 HQ shell

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-hq-shell.test.js; tests/blessboard-authorization.test.js`
- Test/mapping: `blessboard-hq-shell.test.js; blessboard-authorization.test.js`

**Manual QA Steps:**
1. Use role/context: organisation_administrator.
2. Establish precondition: own church.
3. Perform action: GET /hq.
4. Confirm outcome matches: 200 HQ shell.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-034 — HQ/branch behavior — GET branch-admin portal
**QA_ID:** `BB-BR-01`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Church / Branch Management  
**Automated Status:** PASS

**Objective:**  
GET branch-admin portal → 200 shell; wrong branch 403

**Preconditions:**  
- Role/context: branch_administrator
- assigned branch

**Automated Verification:**  
GET branch-admin portal

**Expected Result:**  
200 shell; wrong branch 403

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-branch-admin-shell.test.js; tests/v8-shared-form-studio-authz.test.js`
- Test/mapping: `blessboard-branch-admin-shell.test.js; v8-shared-form-studio-authz.test.js`

**Manual QA Steps:**
1. Use role/context: branch_administrator.
2. Establish precondition: assigned branch.
3. Perform action: GET branch-admin portal.
4. Confirm outcome matches: 200 shell; wrong branch 403.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-035 — HQ/branch behavior — access branch portal
**QA_ID:** `BB-BR-02`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Church / Branch Management  
**Automated Status:** PASS

**Objective:**  
access branch portal → denied

**Preconditions:**  
- Role/context: platform_administrator
- no support mode

**Automated Verification:**  
access branch portal

**Expected Result:**  
denied

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-branch-admin-shell.test.js`
- Test/mapping: `blessboard-branch-admin-shell.test.js`

**Manual QA Steps:**
1. Use role/context: platform_administrator.
2. Establish precondition: no support mode.
3. Perform action: access branch portal.
4. Confirm outcome matches: denied.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-036 — HQ/branch behavior — switch branch mini-site
**QA_ID:** `BB-BR-03`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Church / Branch Management  
**Automated Status:** PASS

**Objective:**  
switch branch mini-site → canonical /c/:org/:branch URLs

**Preconditions:**  
- Role/context: HQ admin
- multi-branch church

**Automated Verification:**  
switch branch mini-site

**Expected Result:**  
canonical /c/:org/:branch URLs

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-branch-mini-websites.test.js; tests/blessboard-branch-mini-website-shell.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `blessboard-branch-mini-websites.test.js; blessboard-branch-mini-website-shell.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: HQ admin.
2. Establish precondition: multi-branch church.
3. Perform action: switch branch mini-site.
4. Confirm outcome matches: canonical /c/:org/:branch URLs.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-037 — website pages — GET home
**QA_ID:** `BB-PUB-HOME`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Publishing  
**Automated Status:** PASS

**Objective:**  
GET home → 200 home content

**Preconditions:**  
- Role/context: anonymous
- published church

**Automated Verification:**  
GET home

**Expected Result:**  
200 home content

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Publish requires grant; unauthorized publish leaves draft/public unchanged.

**Automation Evidence:**
- Test file(s): `tests/blessboard-public-pages.test.js; tests/church-public-home-ministries-regression.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `blessboard-public-pages.test.js; church-public-home-ministries-regression.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: published church.
3. Perform action: GET home.
4. Confirm outcome matches: 200 home content.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-038 — Home — edit home sections/images → publish
**QA_ID:** `BB-PAGE-HOME`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Website Editing  
**Automated Status:** PASS

**Objective:**  
edit home sections/images → publish → public home updated

**Preconditions:**  
- Role/context: editor
- draft home

**Automated Verification:**  
edit home sections/images → publish

**Expected Result:**  
public home updated

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v2-bb-home-leaders-image.test.js; tests/v2-bb-home-leaders-text.test.js; tests/blessboard-public-pages.test.js`
- Test/mapping: `v2-bb-home-leaders-image.test.js; v2-bb-home-leaders-text.test.js; blessboard-public-pages.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: draft home.
3. Perform action: edit home sections/images → publish.
4. Confirm outcome matches: public home updated.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-039 — About — edit about → publish
**QA_ID:** `BB-PAGE-ABOUT`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Website Editing  
**Automated Status:** PASS

**Objective:**  
edit about → publish → public about updated

**Preconditions:**  
- Role/context: editor
- about page

**Automated Verification:**  
edit about → publish

**Expected Result:**  
public about updated

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-public-pages.test.js; tests/blessboard-content-admin.test.js`
- Test/mapping: `blessboard-public-pages.test.js; blessboard-content-admin.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: about page.
3. Perform action: edit about → publish.
4. Confirm outcome matches: public about updated.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-040 — Leadership — add/edit leader + photo
**QA_ID:** `BB-PAGE-LEAD`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Website Editing  
**Automated Status:** PASS

**Objective:**  
add/edit leader + photo → draft+publish; image placement

**Preconditions:**  
- Role/context: editor
- leaders collection

**Automated Verification:**  
add/edit leader + photo

**Expected Result:**  
draft+publish; image placement

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v2-bb-leadership-data-loss.test.js; tests/v2-bb-leadership-section-management.test.js; tests/v2-bb-home-leaders-image.test.js; tests/v2-bb-home-leaders-text.test.js`
- Test/mapping: `v2-bb-leadership-data-loss.test.js; v2-bb-leadership-section-management.test.js; v2-bb-home-leaders-image.test.js; v2-bb-home-leaders-text.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: leaders collection.
3. Perform action: add/edit leader + photo.
4. Confirm outcome matches: draft+publish; image placement.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-041 — Ministries — CRUD ministry + image
**QA_ID:** `BB-PAGE-MIN`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Website Editing  
**Automated Status:** PASS

**Objective:**  
CRUD ministry + image → public ministries reflect publish

**Preconditions:**  
- Role/context: editor
- ministries

**Automated Verification:**  
CRUD ministry + image

**Expected Result:**  
public ministries reflect publish

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/church-branch-ministries.test.js; tests/v2-bb-ministry-image-edit.test.js; tests/v2-bb-ministry-leader-image.test.js; tests/church-public-home-ministries-regression.test.js`
- Test/mapping: `church-branch-ministries.test.js; v2-bb-ministry-image-edit.test.js; v2-bb-ministry-leader-image.test.js; church-public-home-ministries-regression.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: ministries.
3. Perform action: CRUD ministry + image.
4. Confirm outcome matches: public ministries reflect publish.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-042 — Events — create/edit event + image
**QA_ID:** `BB-PAGE-EVT`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Website Editing  
**Automated Status:** PASS

**Objective:**  
create/edit event + image → public events list/detail

**Preconditions:**  
- Role/context: editor
- events

**Automated Verification:**  
create/edit event + image

**Expected Result:**  
public events list/detail

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/church-growth-advanced-events.test.js; tests/church-branch-announcements-events.test.js; tests/church-public-events-sermons-visual.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `church-growth-advanced-events.test.js; church-branch-announcements-events.test.js; church-public-events-sermons-visual.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: events.
3. Perform action: create/edit event + image.
4. Confirm outcome matches: public events list/detail.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-043 — Sermons — create sermon with date+image
**QA_ID:** `BB-PAGE-SER`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Sermons  
**Automated Status:** PASS

**Objective:**  
create sermon with date+image → YYYY-MM-DD accepted; bad dates 400; image persist

**Preconditions:**  
- Role/context: editor
- sermons

**Automated Verification:**  
create sermon with date+image

**Expected Result:**  
YYYY-MM-DD accepted; bad dates 400; image persist

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v2-02-sermon-creation-regression.test.js; tests/v2-bb-sermon-image-persistence.test.js; tests/church-public-events-sermons-visual.test.js`
- Test/mapping: `v2-02-sermon-creation-regression.test.js; v2-bb-sermon-image-persistence.test.js; church-public-events-sermons-visual.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: sermons.
3. Perform action: create sermon with date+image.
4. Confirm outcome matches: YYYY-MM-DD accepted; bad dates 400; image persist.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-044 — Announcements — create/publish announcement
**QA_ID:** `BB-ANN-01`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Announcements  
**Automated Status:** PASS

**Objective:**  
create/publish announcement → persisted; audiences scoped

**Preconditions:**  
- Role/context: HQ/comms
- announcements.manage

**Automated Verification:**  
create/publish announcement

**Expected Result:**  
persisted; audiences scoped

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-announcements.test.js; tests/v8-shared-announcements.test.js`
- Test/mapping: `blessboard-announcements.test.js; v8-shared-announcements.test.js`

**Manual QA Steps:**
1. Use role/context: HQ/comms.
2. Establish precondition: announcements.manage.
3. Perform action: create/publish announcement.
4. Confirm outcome matches: persisted; audiences scoped.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-045 — Announcements — POST announcements media upload
**QA_ID:** `BB-ANN-02`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Announcements  
**Automated Status:** PASS

**Objective:**  
POST announcements media upload → purpose-scoped; no website.edit required

**Preconditions:**  
- Role/context: HQ/comms
- attachment upload

**Automated Verification:**  
POST announcements media upload

**Expected Result:**  
purpose-scoped; no website.edit required

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v2-02-announcements-document-upload-regression.test.js`
- Test/mapping: `v2-02-announcements-document-upload-regression.test.js`

**Manual QA Steps:**
1. Use role/context: HQ/comms.
2. Establish precondition: attachment upload.
3. Perform action: POST announcements media upload.
4. Confirm outcome matches: purpose-scoped; no website.edit required.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-046 — Announcements — publish announcement
**QA_ID:** `BB-ANN-03`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Announcements  
**Automated Status:** PASS

**Objective:**  
publish announcement → platform_publish_denied

**Preconditions:**  
- Role/context: platform_admin
- allowPlatformAdminPublish off

**Automated Verification:**  
publish announcement

**Expected Result:**  
platform_publish_denied

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-announcements.test.js; tests/blessboard-announcement-platform-admin-testing-policy.test.js`
- Test/mapping: `blessboard-announcements.test.js; blessboard-announcement-platform-admin-testing-policy.test.js`

**Manual QA Steps:**
1. Use role/context: platform_admin.
2. Establish precondition: allowPlatformAdminPublish off.
3. Perform action: publish announcement.
4. Confirm outcome matches: platform_publish_denied.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-047 — Contact — edit hours/image/contact fields
**QA_ID:** `BB-PAGE-CON`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Website Editing  
**Automated Status:** PASS

**Objective:**  
edit hours/image/contact fields → draft+publish

**Preconditions:**  
- Role/context: editor
- contact page

**Automated Verification:**  
edit hours/image/contact fields

**Expected Result:**  
draft+publish

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v2-bb-contact-hours-edit.test.js; tests/v2-bb-contact-image-replace.test.js; tests/bb-contact-stitch.test.js`
- Test/mapping: `v2-bb-contact-hours-edit.test.js; v2-bb-contact-image-replace.test.js; bb-contact-stitch.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: contact page.
3. Perform action: edit hours/image/contact fields.
4. Confirm outcome matches: draft+publish.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-048 — Giving — configure giving + public page
**QA_ID:** `BB-PAGE-GIV`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Billing / Refunds / Revenue  
**Automated Status:** PASS

**Objective:**  
configure giving + public page → finance separation preserved

**Preconditions:**  
- Role/context: editor/HQ
- giving settings

**Automated Verification:**  
configure giving + public page

**Expected Result:**  
finance separation preserved

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-giving.test.js; tests/blessboard-finance-separation.test.js; tests/church-public-giving-contact-visual.test.js`
- Test/mapping: `blessboard-giving.test.js; blessboard-finance-separation.test.js; church-public-giving-contact-visual.test.js`

**Manual QA Steps:**
1. Use role/context: editor/HQ.
2. Establish precondition: giving settings.
3. Perform action: configure giving + public page.
4. Confirm outcome matches: finance separation preserved.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-049 — media — upload/list/select media
**QA_ID:** `BB-MED-01`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Media / Uploads  
**Automated Status:** PASS

**Objective:**  
upload/list/select media → scoped library; CSRF

**Preconditions:**  
- Role/context: editor
- Content Library

**Automated Verification:**  
upload/list/select media

**Expected Result:**  
scoped library; CSRF

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed. Media scoped to tenant; CSRF and kill-switch honored where applicable.

**Automation Evidence:**
- Test file(s): `tests/blessboard-media.test.js; tests/v2-shared-media-type-conversion.test.js; tests/v2-shared-media-upload-parity.test.js`
- Test/mapping: `blessboard-media.test.js; v2-shared-media-type-conversion.test.js; v2-shared-media-upload-parity.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: Content Library.
3. Perform action: upload/list/select media.
4. Confirm outcome matches: scoped library; CSRF.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-050 — content editing — edit page/section/entity
**QA_ID:** `BB-CMS-01`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Website Editing  
**Automated Status:** PASS

**Objective:**  
edit page/section/entity → draft apply; classic↔engine dual-write retained

**Preconditions:**  
- Role/context: content admin
- HQ/branch content-admin

**Automated Verification:**  
edit page/section/entity

**Expected Result:**  
draft apply; classic↔engine dual-write retained

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/blessboard-content-admin.test.js; tests/v10-pc11-cms-convergence.test.js; tests/v10-pl05-canonical-cms.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `blessboard-content-admin.test.js; v10-pc11-cms-convergence.test.js; v10-pl05-canonical-cms.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: content admin.
2. Establish precondition: HQ/branch content-admin.
3. Perform action: edit page/section/entity.
4. Confirm outcome matches: draft apply; classic↔engine dual-write retained.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-051 — publishing — publishFromLegacy / publish bridge
**QA_ID:** `BB-PUB-01`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Publishing  
**Automated Status:** PASS

**Objective:**  
publishFromLegacy / publish bridge → public path live; auth negatives

**Preconditions:**  
- Role/context: publisher
- draft ready

**Automated Verification:**  
publishFromLegacy / publish bridge

**Expected Result:**  
public path live; auth negatives

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed. Publish requires grant; unauthorized publish leaves draft/public unchanged.

**Automation Evidence:**
- Test file(s): `tests/blessboard-p0-publish-auth.test.js; tests/v7-blessboard-publish-engine-bridge.test.js; tests/blessboard-church-website-publish.test.js; tests/phase4-publish-website.test.js`
- Test/mapping: `blessboard-p0-publish-auth.test.js; v7-blessboard-publish-engine-bridge.test.js; blessboard-church-website-publish.test.js; phase4-publish-website.test.js`

**Manual QA Steps:**
1. Use role/context: publisher.
2. Establish precondition: draft ready.
3. Perform action: publishFromLegacy / publish bridge.
4. Confirm outcome matches: public path live; auth negatives.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-052 — publishing — restore previous website
**QA_ID:** `BB-PUB-02`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Publishing  
**Automated Status:** PASS

**Objective:**  
restore previous website → draft restored; public until re-publish

**Preconditions:**  
- Role/context: publisher
- prior version

**Automated Verification:**  
restore previous website

**Expected Result:**  
draft restored; public until re-publish

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed. Publish requires grant; unauthorized publish leaves draft/public unchanged.

**Automation Evidence:**
- Test file(s): `tests/phase4-restore-previous-website.test.js; tests/phase3-website-version-compare-restore.test.js; tests/phase3-website-version-history.test.js; tests/v2-01-field-history-restore.test.js`
- Test/mapping: `phase4-restore-previous-website.test.js; phase3-website-version-compare-restore.test.js; phase3-website-version-history.test.js; v2-01-field-history-restore.test.js`

**Manual QA Steps:**
1. Use role/context: publisher.
2. Establish precondition: prior version.
3. Perform action: restore previous website.
4. Confirm outcome matches: draft restored; public until re-publish.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-053 — roles/access — invite + accept catalogue role
**QA_ID:** `BB-RBAC-01`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** RBAC / Access Control  
**Automated Status:** PASS

**Objective:**  
invite + accept catalogue role → URA row; seats counted

**Preconditions:**  
- Role/context: HQ admin
- staff invite

**Automated Verification:**  
invite + accept catalogue role

**Expected Result:**  
URA row; seats counted

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed. Role catalogue authorization enforced; privilege escalation denied.

**Automation Evidence:**
- Test file(s): `tests/blessboard-staff-invitation.test.js; tests/blessboard-hq-roles.test.js; tests/blessboard-rbac-e2e.test.js`
- Test/mapping: `blessboard-staff-invitation.test.js; blessboard-hq-roles.test.js; blessboard-rbac-e2e.test.js`

**Manual QA Steps:**
1. Use role/context: HQ admin.
2. Establish precondition: staff invite.
3. Perform action: invite + accept catalogue role.
4. Confirm outcome matches: URA row; seats counted.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-054 — roles/access — authz path
**QA_ID:** `BB-RBAC-02`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** RBAC / Access Control  
**Automated Status:** PASS

**Objective:**  
authz path → zero runtime R/W to user_roles

**Preconditions:**  
- Role/context: runtime
- legacy user_roles

**Automated Verification:**  
authz path

**Expected Result:**  
zero runtime R/W to user_roles

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed. Role catalogue authorization enforced; privilege escalation denied.

**Automation Evidence:**
- Test file(s): `tests/v2-02-legacy-rbac-removal.test.js; tests/v10-dbcl04-canonical-cleanup-baseline.test.js`
- Test/mapping: `v2-02-legacy-rbac-removal.test.js; v10-dbcl04-canonical-cleanup-baseline.test.js`

**Manual QA Steps:**
1. Use role/context: runtime.
2. Establish precondition: legacy user_roles.
3. Perform action: authz path.
4. Confirm outcome matches: zero runtime R/W to user_roles.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-055 — V2.02 QA — Category A/B/D framing lifecycle
**QA_ID:** `BB-V202-IMG`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Image Editing  
**Automated Status:** PASS

**Objective:**  
Category A/B/D framing lifecycle → coverage matrix green

**Preconditions:**  
- Role/context: editor
- Universal Image Editor

**Automated Verification:**  
Category A/B/D framing lifecycle

**Expected Result:**  
coverage matrix green

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v2-02-universal-image-editor-coverage.test.js; tests/v2-02-structured-image-framing-lifecycle.test.js`
- Test/mapping: `v2-02-universal-image-editor-coverage.test.js; v2-02-structured-image-framing-lifecycle.test.js`

**Manual QA Steps:**
1. Use role/context: editor.
2. Establish precondition: Universal Image Editor.
3. Perform action: Category A/B/D framing lifecycle.
4. Confirm outcome matches: coverage matrix green.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-056 — V2.03 QA — register→website→media→publish→public
**QA_ID:** `BB-V203-E2E`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Other verified V2.03 areas  
**Automated Status:** PASS

**Objective:**  
register→website→media→publish→public → journey suite + deny cross-tenant

**Preconditions:**  
- Role/context: admin
- fresh org

**Automated Verification:**  
register→website→media→publish→public

**Expected Result:**  
journey suite + deny cross-tenant

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v7-local-registration-to-website-e2e.test.js`
- Test/mapping: `v7-local-registration-to-website-e2e.test.js`

**Manual QA Steps:**
1. Use role/context: admin.
2. Establish precondition: fresh org.
3. Perform action: register→website→media→publish→public.
4. Confirm outcome matches: journey suite + deny cross-tenant.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-057 — V2.03 QA — npm run test:v203:bb-regression
**QA_ID:** `BB-V203-REG`  
**Product:** BLESSBOARD (`BLESSBOARD`)  
**Functional Area:** Other verified V2.03 areas  
**Automated Status:** PASS

**Objective:**  
npm run test:v203:bb-regression → 274 pass historically

**Preconditions:**  
- Role/context: QA10 pack
- curated surfaces

**Automated Verification:**  
npm run test:v203:bb-regression

**Expected Result:**  
274 pass historically

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v2-02-legacy-rbac-removal.test.js; tests/v2-02-bb-catalogue-only-rbac.test.js; tests/blessboard-auth-schema.test.js; tests/blessboard-phone-login.test.js; tests/blessboard-authorization.test.js; tests/blessboard-staff-access.test.js; tests/blessboard-hq-roles.test.js; tests/blessboard-hq-branch-user-creation.test.js; tests/blessboard-hq-shell.test.js; tests/blessboard-branch-admin-shell.test.js; tests/blessboard-p0-publish-auth.test.js; tests/v7-blessboard-publish-engine-bridge.test.js; tests/phase4-restore-previous-website.test.js; tests/blessboard-public-pages.test.js; tests/blessboard-content-admin.test.js; tests/blessboard-giving.test.js; tests/blessboard-finance-separation.test.js; tests/v2-bb-sermon-image-persistence.test.js; tests/v2-bb-contact-hours-edit.test.js; tests/church-branch-ministries.test.js; tests/church-branch-announcements-events.test.js; tests/platform-entitlements.test.js; tests/v2-01-bb-inline-editor-parity.test.js; tests/v2-01-field-history-restore.test.js; tests/v203-bb-regression-test-readiness.test.js`
- Test/mapping: `npm run test:v203:bb-regression`

**Manual QA Steps:**
1. Use role/context: QA10 pack.
2. Establish precondition: curated surfaces.
3. Perform action: npm run test:v203:bb-regression.
4. Confirm outcome matches: 274 pass historically.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

## PART C — ACTIVECLINIC

_Scenarios in this part: **34**_

### QA-058 — clinic registration — register clinic multi-step
**QA_ID:** `AC-REG-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Registration  
**Automated Status:** PASS

**Objective:**  
register clinic multi-step → success; org+facility; credentials

**Preconditions:**  
- Role/context: anonymous
- AC host

**Automated Verification:**  
register clinic multi-step

**Expected Result:**  
success; org+facility; credentials

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-acw09-registration.test.js; tests/activeclinic-clinic-registration.test.js; tests/activeclinic-clinic-onboarding.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `activeclinic-acw09-registration.test.js; activeclinic-clinic-registration.test.js; activeclinic-clinic-onboarding.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: AC host.
3. Perform action: register clinic multi-step.
4. Confirm outcome matches: success; org+facility; credentials.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-059 — clinic registration — confirm registration
**QA_ID:** `AC-REG-02`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Registration  
**Automated Status:** PASS

**Objective:**  
confirm registration → 400 consent required

**Preconditions:**  
- Role/context: anonymous
- missing registration_consent

**Automated Verification:**  
confirm registration

**Expected Result:**  
400 consent required

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-registration-terms.test.js; tests/activeclinic-clinic-registration.test.js`
- Test/mapping: `activeclinic-registration-terms.test.js; activeclinic-clinic-registration.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: missing registration_consent.
3. Perform action: confirm registration.
4. Confirm outcome matches: 400 consent required.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-060 — first login/setup — first login → onboarding checklist
**QA_ID:** `AC-SETUP-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Registration  
**Automated Status:** PASS

**Objective:**  
first login → onboarding checklist → ACN01 setup state

**Preconditions:**  
- Role/context: clinic admin
- post-register

**Automated Verification:**  
first login → onboarding checklist

**Expected Result:**  
ACN01 setup state

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch1a-config.test.js`
- Test/mapping: `activeclinic-batch1a-config.test.js`

**Manual QA Steps:**
1. Use role/context: clinic admin.
2. Establish precondition: post-register.
3. Perform action: first login → onboarding checklist.
4. Confirm outcome matches: ACN01 setup state.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-061 — facilities — CRUD facilities
**QA_ID:** `AC-FAC-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Clinic / Facility Management  
**Automated Status:** PASS

**Objective:**  
CRUD facilities → facility isolation on lists/writes

**Preconditions:**  
- Role/context: facility admin
- multi-facility org

**Automated Verification:**  
CRUD facilities

**Expected Result:**  
facility isolation on lists/writes

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch2-facilities.test.js; tests/activeclinic-facility-foundation.test.js; tests/activeclinic-facility-public-hours.test.js`
- Test/mapping: `activeclinic-batch2-facilities.test.js; activeclinic-facility-foundation.test.js; activeclinic-facility-public-hours.test.js`

**Manual QA Steps:**
1. Use role/context: facility admin.
2. Establish precondition: multi-facility org.
3. Perform action: CRUD facilities.
4. Confirm outcome matches: facility isolation on lists/writes.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-062 — facilities — access foreign facility data
**QA_ID:** `AC-FAC-02`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Clinic / Facility Management  
**Automated Status:** PASS

**Objective:**  
access foreign facility data → deny

**Preconditions:**  
- Role/context: staff
- unassigned facility

**Automated Verification:**  
access foreign facility data

**Expected Result:**  
deny

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch2-rbac-isolation.test.js`
- Test/mapping: `activeclinic-batch2-rbac-isolation.test.js`

**Manual QA Steps:**
1. Use role/context: staff.
2. Establish precondition: unassigned facility.
3. Perform action: access foreign facility data.
4. Confirm outcome matches: deny.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-063 — staff/invites — send invite → accept role
**QA_ID:** `AC-STAFF-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Staff Management  
**Automated Status:** PASS

**Objective:**  
send invite → accept role → staff member + RBAC

**Preconditions:**  
- Role/context: admin
- invite staff

**Automated Verification:**  
send invite → accept role

**Expected Result:**  
staff member + RBAC

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-staff-invitation.test.js; tests/activeclinic-roles-access-admin.test.js; tests/activeclinic-roles-access-parity.test.js`
- Test/mapping: `activeclinic-staff-invitation.test.js; activeclinic-roles-access-admin.test.js; activeclinic-roles-access-parity.test.js`

**Manual QA Steps:**
1. Use role/context: admin.
2. Establish precondition: invite staff.
3. Perform action: send invite → accept role.
4. Confirm outcome matches: staff member + RBAC.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-064 — staff/invites — attempt invite
**QA_ID:** `AC-STAFF-02`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Staff Management  
**Automated Status:** PASS

**Objective:**  
attempt invite → denied

**Preconditions:**  
- Role/context: cashier
- invite staff

**Automated Verification:**  
attempt invite

**Expected Result:**  
denied

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-staff-invitation.test.js`
- Test/mapping: `activeclinic-staff-invitation.test.js`

**Manual QA Steps:**
1. Use role/context: cashier.
2. Establish precondition: invite staff.
3. Perform action: attempt invite.
4. Confirm outcome matches: denied.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-065 — departments — create department
**QA_ID:** `AC-DEPT-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Clinic / Facility Management  
**Automated Status:** PASS

**Objective:**  
create department → validation on type/name; persist

**Preconditions:**  
- Role/context: admin
- facilities exist

**Automated Verification:**  
create department

**Expected Result:**  
validation on type/name; persist

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch2-facilities.test.js`
- Test/mapping: `activeclinic-batch2-facilities.test.js`

**Manual QA Steps:**
1. Use role/context: admin.
2. Establish precondition: facilities exist.
3. Perform action: create department.
4. Confirm outcome matches: validation on type/name; persist.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-066 — patients — create/search patient + consent
**QA_ID:** `AC-PAT-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Patient  
**Automated Status:** PASS

**Objective:**  
create/search patient + consent → persist; invalid consent rejected

**Preconditions:**  
- Role/context: reception
- clinic

**Automated Verification:**  
create/search patient + consent

**Expected Result:**  
persist; invalid consent rejected

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch1a-patient-reception.test.js; tests/activeclinic-batch2-patient-workspace.test.js`
- Test/mapping: `activeclinic-batch1a-patient-reception.test.js; activeclinic-batch2-patient-workspace.test.js`

**Manual QA Steps:**
1. Use role/context: reception.
2. Establish precondition: clinic.
3. Perform action: create/search patient + consent.
4. Confirm outcome matches: persist; invalid consent rejected.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-067 — patients — merge/duplicate assessment
**QA_ID:** `AC-PAT-02`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Patient  
**Automated Status:** PASS

**Objective:**  
merge/duplicate assessment → org-scoped; no cross-tenant merge

**Preconditions:**  
- Role/context: reception
- duplicate patient

**Automated Verification:**  
merge/duplicate assessment

**Expected Result:**  
org-scoped; no cross-tenant merge

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-patient-foundation.test.js; tests/activeclinic-patient-merge-safety.test.js; tests/activeclinic-patient-portal.test.js; tests/activeclinic-patient-registration-rbac.test.js`
- Test/mapping: `activeclinic-patient-foundation.test.js; activeclinic-patient-merge-safety.test.js; activeclinic-patient-portal.test.js; activeclinic-patient-registration-rbac.test.js`

**Manual QA Steps:**
1. Use role/context: reception.
2. Establish precondition: duplicate patient.
3. Perform action: merge/duplicate assessment.
4. Confirm outcome matches: org-scoped; no cross-tenant merge.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-068 — appointments — create appointment
**QA_ID:** `AC-APT-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Appointments / Booking  
**Automated Status:** PASS

**Objective:**  
create appointment → collision blocked; lifecycle transitions

**Preconditions:**  
- Role/context: scheduler
- services+practitioners

**Automated Verification:**  
create appointment

**Expected Result:**  
collision blocked; lifecycle transitions

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch1a-appointments.test.js; tests/activeclinic-batch2-appointments-workspace.test.js`
- Test/mapping: `activeclinic-batch1a-appointments.test.js; activeclinic-batch2-appointments-workspace.test.js`

**Manual QA Steps:**
1. Use role/context: scheduler.
2. Establish precondition: services+practitioners.
3. Perform action: create appointment.
4. Confirm outcome matches: collision blocked; lifecycle transitions.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-069 — appointments — create for unassigned facility
**QA_ID:** `AC-APT-02`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Appointments / Booking  
**Automated Status:** PASS

**Objective:**  
create for unassigned facility → deny

**Preconditions:**  
- Role/context: scheduler
- wrong facility

**Automated Verification:**  
create for unassigned facility

**Expected Result:**  
deny

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch2-rbac-isolation.test.js`
- Test/mapping: `activeclinic-batch2-rbac-isolation.test.js`

**Manual QA Steps:**
1. Use role/context: scheduler.
2. Establish precondition: wrong facility.
3. Perform action: create for unassigned facility.
4. Confirm outcome matches: deny.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-070 — booking — public booking request
**QA_ID:** `AC-BOOK-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Appointments / Booking  
**Automated Status:** PASS

**Objective:**  
public booking request → request stored; staff triage

**Preconditions:**  
- Role/context: public
- published clinic

**Automated Verification:**  
public booking request

**Expected Result:**  
request stored; staff triage

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-public-booking.test.js; tests/activeclinic-mf10-booking.test.js; tests/activeclinic-batch1a-appointments.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `activeclinic-public-booking.test.js; activeclinic-mf10-booking.test.js; activeclinic-batch1a-appointments.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: public.
2. Establish precondition: published clinic.
3. Perform action: public booking request.
4. Confirm outcome matches: request stored; staff triage.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-071 — booking — link guest booking to portal
**QA_ID:** `AC-BOOK-02`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Appointments / Booking  
**Automated Status:** PASS

**Objective:**  
link guest booking to portal → owner-only lists; invalid token 400

**Preconditions:**  
- Role/context: patient
- guest token

**Automated Verification:**  
link guest booking to portal

**Expected Result:**  
owner-only lists; invalid token 400

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-patient-portal.test.js; tests/activeclinic-mf08-patient-registration.test.js; tests/activeclinic-booking-patient-linkage.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `activeclinic-patient-portal.test.js; activeclinic-mf08-patient-registration.test.js; activeclinic-booking-patient-linkage.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: patient.
2. Establish precondition: guest token.
3. Perform action: link guest booking to portal.
4. Confirm outcome matches: owner-only lists; invalid token 400.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-072 — clinical — encounter workspace + notes
**QA_ID:** `AC-CLIN-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Clinical  
**Automated Status:** PASS

**Objective:**  
encounter workspace + notes → persist HPI/assessment; close encounter

**Preconditions:**  
- Role/context: clinician
- checked-in patient

**Automated Verification:**  
encounter workspace + notes

**Expected Result:**  
persist HPI/assessment; close encounter

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch1a-clinical.test.js; tests/activeclinic-batch2-clinical-encounter.test.js`
- Test/mapping: `activeclinic-batch1a-clinical.test.js; activeclinic-batch2-clinical-encounter.test.js`

**Manual QA Steps:**
1. Use role/context: clinician.
2. Establish precondition: checked-in patient.
3. Perform action: encounter workspace + notes.
4. Confirm outcome matches: persist HPI/assessment; close encounter.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-073 — clinical — record vitals
**QA_ID:** `AC-CLIN-02`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Clinical  
**Automated Status:** PASS

**Objective:**  
record vitals → facility-scoped; satellite deny

**Preconditions:**  
- Role/context: clinician
- ACN17

**Automated Verification:**  
record vitals

**Expected Result:**  
facility-scoped; satellite deny

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch3-acn17-acn19.test.js`
- Test/mapping: `activeclinic-batch3-acn17-acn19.test.js`

**Manual QA Steps:**
1. Use role/context: clinician.
2. Establish precondition: ACN17.
3. Perform action: record vitals.
4. Confirm outcome matches: facility-scoped; satellite deny.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-074 — clinical — clinical document draft→finalize
**QA_ID:** `AC-CLIN-03`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Clinical  
**Automated Status:** PASS

**Objective:**  
clinical document draft→finalize → authz+facility isolation; no public CMS storage

**Preconditions:**  
- Role/context: clinician
- ACN18

**Automated Verification:**  
clinical document draft→finalize

**Expected Result:**  
authz+facility isolation; no public CMS storage

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch3-acn18-clinical-documents.test.js`
- Test/mapping: `activeclinic-batch3-acn18-clinical-documents.test.js`

**Manual QA Steps:**
1. Use role/context: clinician.
2. Establish precondition: ACN18.
3. Perform action: clinical document draft→finalize.
4. Confirm outcome matches: authz+facility isolation; no public CMS storage.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-075 — clinical — order prescription
**QA_ID:** `AC-CLIN-04`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Clinical  
**Automated Status:** PASS

**Objective:**  
order prescription → clinical_order → pharmacy handoff

**Preconditions:**  
- Role/context: clinician
- ACN19

**Automated Verification:**  
order prescription

**Expected Result:**  
clinical_order → pharmacy handoff

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch3-acn17-acn19.test.js`
- Test/mapping: `activeclinic-batch3-acn17-acn19.test.js`

**Manual QA Steps:**
1. Use role/context: clinician.
2. Establish precondition: ACN19.
3. Perform action: order prescription.
4. Confirm outcome matches: clinical_order → pharmacy handoff.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-076 — clinical — referrals list
**QA_ID:** `AC-CLIN-05`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Clinical  
**Automated Status:** PASS

**Objective:**  
referrals list → presentation over follow-up

**Preconditions:**  
- Role/context: clinician
- ACN20

**Automated Verification:**  
referrals list

**Expected Result:**  
presentation over follow-up

**Security / Isolation:**  
Standard authenticated/public contract as stated in expected result; no widening of authz.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch3-acn20.test.js`
- Test/mapping: `activeclinic-batch3-acn20.test.js`

**Manual QA Steps:**
1. Use role/context: clinician.
2. Establish precondition: ACN20.
3. Perform action: referrals list.
4. Confirm outcome matches: presentation over follow-up.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-077 — pharmacy — dispense
**QA_ID:** `AC-PHARM-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Clinical  
**Automated Status:** PASS

**Objective:**  
dispense → RBAC+validation; receptionist denied

**Preconditions:**  
- Role/context: pharmacist
- prescription queue

**Automated Verification:**  
dispense

**Expected Result:**  
RBAC+validation; receptionist denied

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch2-operational-queues.test.js; tests/activeclinic-pharmacy-foundation.test.js; tests/activeclinic-pharmacy-ui-parity.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `activeclinic-batch2-operational-queues.test.js; activeclinic-pharmacy-foundation.test.js; activeclinic-pharmacy-ui-parity.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: pharmacist.
2. Establish precondition: prescription queue.
3. Perform action: dispense.
4. Confirm outcome matches: RBAC+validation; receptionist denied.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-078 — laboratory — lab request workflow
**QA_ID:** `AC-LAB-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Clinical  
**Automated Status:** PASS

**Objective:**  
lab request workflow → department-gated diagnostics

**Preconditions:**  
- Role/context: lab staff
- diagnostics queue

**Automated Verification:**  
lab request workflow

**Expected Result:**  
department-gated diagnostics

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch2-operational-queues.test.js; tests/activeclinic-diagnostics-foundation.test.js; tests/activeclinic-diagnostics-rbac.test.js; tests/activeclinic-diagnostics-ui-parity.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `activeclinic-batch2-operational-queues.test.js; activeclinic-diagnostics-foundation.test.js; activeclinic-diagnostics-rbac.test.js; activeclinic-diagnostics-ui-parity.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: lab staff.
2. Establish precondition: diagnostics queue.
3. Perform action: lab request workflow.
4. Confirm outcome matches: department-gated diagnostics.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-079 — radiology — radiology request workflow
**QA_ID:** `AC-RAD-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Clinical  
**Automated Status:** PASS

**Objective:**  
radiology request workflow → department boundary vs lab

**Preconditions:**  
- Role/context: rad staff
- diagnostics rad queue

**Automated Verification:**  
radiology request workflow

**Expected Result:**  
department boundary vs lab

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch2-operational-queues.test.js; tests/activeclinic-diagnostics-foundation.test.js; tests/activeclinic-diagnostics-rbac.test.js; tests/activeclinic-diagnostics-ui-parity.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `activeclinic-batch2-operational-queues.test.js; activeclinic-diagnostics-foundation.test.js; activeclinic-diagnostics-rbac.test.js; activeclinic-diagnostics-ui-parity.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: rad staff.
2. Establish precondition: diagnostics rad queue.
3. Perform action: radiology request workflow.
4. Confirm outcome matches: department boundary vs lab.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-080 — billing — create/post invoice
**QA_ID:** `AC-BILL-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Billing / Refunds / Revenue  
**Automated Status:** PASS

**Objective:**  
create/post invoice → immutable after post; facility mismatch deny

**Preconditions:**  
- Role/context: biller
- charges

**Automated Verification:**  
create/post invoice

**Expected Result:**  
immutable after post; facility mismatch deny

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch1a-billing.test.js; tests/activeclinic-batch2-billing.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `activeclinic-batch1a-billing.test.js; activeclinic-batch2-billing.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: biller.
2. Establish precondition: charges.
3. Perform action: create/post invoice.
4. Confirm outcome matches: immutable after post; facility mismatch deny.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-081 — billing — collect payment + receipt
**QA_ID:** `AC-BILL-02`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Billing / Refunds / Revenue  
**Automated Status:** PASS

**Objective:**  
collect payment + receipt → cash without session rejected; SoD

**Preconditions:**  
- Role/context: cashier
- open session

**Automated Verification:**  
collect payment + receipt

**Expected Result:**  
cash without session rejected; SoD

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch1a-billing.test.js; tests/activeclinic-finance-rbac.test.js`
- Test/mapping: `activeclinic-batch1a-billing.test.js; activeclinic-finance-rbac.test.js`

**Manual QA Steps:**
1. Use role/context: cashier.
2. Establish precondition: open session.
3. Perform action: collect payment + receipt.
4. Confirm outcome matches: cash without session rejected; SoD.
5. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-082 — access/RBAC — role×route matrix
**QA_ID:** `AC-RBAC-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** RBAC / Access Control  
**Automated Status:** PASS

**Objective:**  
role×route matrix → deny wrong role; forged IDs

**Preconditions:**  
- Role/context: matrix roles
- Batch2 hubs

**Automated Verification:**  
role×route matrix

**Expected Result:**  
deny wrong role; forged IDs

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed. Role catalogue authorization enforced; privilege escalation denied.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch2-rbac-isolation.test.js; tests/activeclinic-roles-access-admin.test.js; tests/activeclinic-roles-access-parity.test.js; tests/activeclinic-navigation-rbac.test.js`
- Test/mapping: `activeclinic-batch2-rbac-isolation.test.js; activeclinic-roles-access-admin.test.js; activeclinic-roles-access-parity.test.js; activeclinic-navigation-rbac.test.js`

**Manual QA Steps:**
1. Use role/context: matrix roles.
2. Establish precondition: Batch2 hubs.
3. Perform action: role×route matrix.
4. Confirm outcome matches: deny wrong role; forged IDs.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-083 — website/editor — edit→media→publish→public
**QA_ID:** `AC-WEB-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Website Editing  
**Automated Status:** PASS

**Objective:**  
edit→media→publish→public → PC10B baseline + deny editor-only publish

**Preconditions:**  
- Role/context: website editor
- clinic website

**Automated Verification:**  
edit→media→publish→public

**Expected Result:**  
PC10B baseline + deny editor-only publish

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v10-pc10b-ac-website-workflow-baseline.test.js; tests/activeclinic-website-cms.test.js; tests/activeclinic-website-hardening.test.js; tests/activeclinic-website-json-error-matrix.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `v10-pc10b-ac-website-workflow-baseline.test.js; activeclinic-website-cms.test.js; activeclinic-website-hardening.test.js; activeclinic-website-json-error-matrix.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: website editor.
2. Establish precondition: clinic website.
3. Perform action: edit→media→publish→public.
4. Confirm outcome matches: PC10B baseline + deny editor-only publish.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-084 — public clinic pages — GET public pages
**QA_ID:** `AC-PUB-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Publishing  
**Automated Status:** PASS

**Objective:**  
GET public pages → 200 public; unpublished gated

**Preconditions:**  
- Role/context: anonymous
- published clinic

**Automated Verification:**  
GET public pages

**Expected Result:**  
200 public; unpublished gated

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed. Publish requires grant; unauthorized publish leaves draft/public unchanged.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-public-website.test.js; tests/activeclinic-clinic-website-availability.test.js; tests/activeclinic-website-hardening.test.js`
- Test/mapping: `activeclinic-public-website.test.js; activeclinic-clinic-website-availability.test.js; activeclinic-website-hardening.test.js`

**Manual QA Steps:**
1. Use role/context: anonymous.
2. Establish precondition: published clinic.
3. Perform action: GET public pages.
4. Confirm outcome matches: 200 public; unpublished gated.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-085 — patient portal — bookings/profile/invoices/summaries
**QA_ID:** `AC-PORT-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Patient  
**Automated Status:** PASS

**Objective:**  
bookings/profile/invoices/summaries → owner-only; cross-patient deny

**Preconditions:**  
- Role/context: patient
- portal session

**Automated Verification:**  
bookings/profile/invoices/summaries

**Expected Result:**  
owner-only; cross-patient deny

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-patient-portal.test.js; tests/activeclinic-batch3-acp03-acp07.test.js; tests/activeclinic-batch3-acp05-visit-summary.test.js; tests/activeclinic-batch3-acp06.test.js; tests/v203-qa-automation-gaps.test.js`
- Test/mapping: `activeclinic-patient-portal.test.js; activeclinic-batch3-acp03-acp07.test.js; activeclinic-batch3-acp05-visit-summary.test.js; activeclinic-batch3-acp06.test.js; v203-qa-automation-gaps.test.js`

**Manual QA Steps:**
1. Use role/context: patient.
2. Establish precondition: portal session.
3. Perform action: bookings/profile/invoices/summaries.
4. Confirm outcome matches: owner-only; cross-patient deny.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-086 — patient portal — release visit summary
**QA_ID:** `AC-PORT-02`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Patient  
**Automated Status:** PASS

**Objective:**  
release visit summary → patient-safe snapshot; PDF deferred contract

**Preconditions:**  
- Role/context: clinician
- AC-P05

**Automated Verification:**  
release visit summary

**Expected Result:**  
patient-safe snapshot; PDF deferred contract

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch3-acp05-visit-summary.test.js`
- Test/mapping: `activeclinic-batch3-acp05-visit-summary.test.js`

**Manual QA Steps:**
1. Use role/context: clinician.
2. Establish precondition: AC-P05.
3. Perform action: release visit summary.
4. Confirm outcome matches: patient-safe snapshot; PDF deferred contract.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-087 — rooms/spaces — CRUD rooms
**QA_ID:** `AC-ROOM-01`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Clinic / Facility Management  
**Automated Status:** PASS

**Objective:**  
CRUD rooms → facility list isolation; no occupancy engine

**Preconditions:**  
- Role/context: facility admin
- ACN27

**Automated Verification:**  
CRUD rooms

**Expected Result:**  
facility list isolation; no occupancy engine

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch3-acn27-rooms.test.js`
- Test/mapping: `activeclinic-batch3-acn27-rooms.test.js`

**Manual QA Steps:**
1. Use role/context: facility admin.
2. Establish precondition: ACN27.
3. Perform action: CRUD rooms.
4. Confirm outcome matches: facility list isolation; no occupancy engine.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-088 — Batch1 — GET hubs
**QA_ID:** `AC-B1-NAV`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Other verified V2.03 areas  
**Automated Status:** PASS

**Objective:**  
GET hubs → Stitch markers + unauth deny

**Preconditions:**  
- Role/context: staff
- Batch1 hubs ACN01–26

**Automated Verification:**  
GET hubs

**Expected Result:**  
Stitch markers + unauth deny

**Security / Isolation:**  
Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch1a-appointments.test.js; tests/activeclinic-batch1a-billing.test.js; tests/activeclinic-batch1a-clinical.test.js; tests/activeclinic-batch1a-config.test.js`
- Test/mapping: `activeclinic-batch1a-appointments.test.js; activeclinic-batch1a-billing.test.js; activeclinic-batch1a-clinical.test.js; activeclinic-batch1a-config.test.js`

**Manual QA Steps:**
1. Use role/context: staff.
2. Establish precondition: Batch1 hubs ACN01–26.
3. Perform action: GET hubs.
4. Confirm outcome matches: Stitch markers + unauth deny.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-089 — Batch2 — GET hubs + mutations
**QA_ID:** `AC-B2-NAV`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Other verified V2.03 areas  
**Automated Status:** PASS

**Objective:**  
GET hubs + mutations → STRONG readiness pack

**Preconditions:**  
- Role/context: staff
- Batch2 hubs B2-01…10

**Automated Verification:**  
GET hubs + mutations

**Expected Result:**  
STRONG readiness pack

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch2-appointments-workspace.test.js; tests/activeclinic-batch2-billing.test.js; tests/activeclinic-batch2-clinical-encounter.test.js; tests/activeclinic-batch2-dashboard.test.js`
- Test/mapping: `activeclinic-batch2-appointments-workspace.test.js; activeclinic-batch2-billing.test.js; activeclinic-batch2-clinical-encounter.test.js; activeclinic-batch2-dashboard.test.js`

**Manual QA Steps:**
1. Use role/context: staff.
2. Establish precondition: Batch2 hubs B2-01…10.
3. Perform action: GET hubs + mutations.
4. Confirm outcome matches: STRONG readiness pack.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-090 — Batch3 — inventory + authz/facility
**QA_ID:** `AC-B3-NAV`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Other verified V2.03 areas  
**Automated Status:** PASS

**Objective:**  
inventory + authz/facility → STRONG readiness pack; deferred contracts asserted

**Preconditions:**  
- Role/context: staff/patient
- Batch3 screens

**Automated Verification:**  
inventory + authz/facility

**Expected Result:**  
STRONG readiness pack; deferred contracts asserted

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/activeclinic-batch3-acn17-acn19.test.js; tests/activeclinic-batch3-acn18-clinical-documents.test.js; tests/activeclinic-batch3-acn20.test.js; tests/activeclinic-batch3-acn27-rooms.test.js`
- Test/mapping: `activeclinic-batch3-acn17-acn19.test.js; activeclinic-batch3-acn18-clinical-documents.test.js; activeclinic-batch3-acn20.test.js; activeclinic-batch3-acn27-rooms.test.js`

**Manual QA Steps:**
1. Use role/context: staff/patient.
2. Establish precondition: Batch3 screens.
3. Perform action: inventory + authz/facility.
4. Confirm outcome matches: STRONG readiness pack; deferred contracts asserted.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

### QA-091 — V2.03 QA — register→facility→staff→clinical→portal
**QA_ID:** `AC-V203-E2E`  
**Product:** ACTIVECLINIC (`ACTIVECLINIC`)  
**Functional Area:** Other verified V2.03 areas  
**Automated Status:** PASS

**Objective:**  
register→facility→staff→clinical→portal → journey suite

**Preconditions:**  
- Role/context: admin
- fresh clinic

**Automated Verification:**  
register→facility→staff→clinical→portal

**Expected Result:**  
journey suite

**Security / Isolation:**  
Cross-tenant access must be denied; no data leakage across organizations. Unauthorized / wrong-role / malformed attempts must fail closed.

**Automation Evidence:**
- Test file(s): `tests/v203-end-to-end-journeys.test.js`
- Test/mapping: `tests/v203-end-to-end-journeys.test.js (journey map)`

**Manual QA Steps:**
1. Use role/context: admin.
2. Establish precondition: fresh clinic.
3. Perform action: register→facility→staff→clinical→portal.
4. Confirm outcome matches: journey suite.
5. Repeat with a second tenant/org where applicable and confirm isolation (deny / no leak).
6. Also attempt the unauthorized/negative path and confirm controlled failure.

**Manual QA Result:**  
[ ] PASS  
[ ] FAIL  
[ ] BLOCKED

**QA Notes:**  
________________________________________

---

## Appendix — Traceability

| Export | QA_ID | TEST_FILE | TEST_NAME/MAPPING | FINAL_AUTOMATED_RESULT |
|---|---|---|---|---|
| QA-001 | `SH-AUTH-01` | `tests/v8-shared-auth-password-security.test.js; tests/blessboard-auth-http.test.js; tests/activeclinic-acw08-auth.tes…` | `v8-shared-auth-password-security.test.js; blessboard-auth-http.test.js; activ…` | PASS |
| QA-002 | `SH-AUTH-02` | `tests/v8-shared-session-security.test.js; tests/blessboard-phone-login.test.js; tests/activeclinic-acw08-auth.test.js…` | `v8-shared-session-security.test.js; blessboard-phone-login.test.js; activecli…` | PASS |
| QA-003 | `SH-AUTH-03` | `tests/v8-shared-auth-password-security.test.js; tests/activeclinic-acw08-auth.test.js` | `v8-shared-auth-password-security.test.js; activeclinic-acw08-auth.test.js` | PASS |
| QA-004 | `SH-AUTH-04` | `tests/activeclinic-logout-after-switch.test.js; tests/v8-shared-session-security.test.js; tests/blessboard-auth-http.…` | `activeclinic-logout-after-switch.test.js; v8-shared-session-security.test.js;…` | PASS |
| QA-005 | `SH-AUTH-05` | `tests/activeclinic-unified-login.test.js; tests/v7-runtime-env-isolation.test.js; tests/v8-tenant-product-isolation.t…` | `activeclinic-unified-login.test.js; v7-runtime-env-isolation.test.js; v8-tena…` | PASS |
| QA-006 | `SH-ID-01` | `tests/v7-shared-phone-identity.test.js; tests/v7-bb-ac-phone-parity.test.js; tests/blessboard-registration-phone.test.js` | `v7-shared-phone-identity.test.js; v7-bb-ac-phone-parity.test.js; blessboard-r…` | PASS |
| QA-007 | `SH-ID-02` | `tests/v8-shared-verification.test.js; tests/blessboard-registration-email-verification-delivery.test.js; tests/blessb…` | `v8-shared-verification.test.js; blessboard-registration-email-verification-de…` | PASS |
| QA-008 | `SH-ID-03` | `tests/blessboard-phone-login.test.js; tests/v7-shared-phone-identity.test.js; tests/activeclinic-mf-identity.test.js` | `blessboard-phone-login.test.js; v7-shared-phone-identity.test.js; activeclini…` | PASS |
| QA-009 | `SH-REG-01` | `tests/v7-unified-registration-engine.test.js` | `v7-unified-registration-engine.test.js` | PASS |
| QA-010 | `SH-REG-02` | `tests/blessboard-instant-free-registration.test.js; tests/activeclinic-clinic-onboarding.test.js; tests/activeclinic-…` | `blessboard-instant-free-registration.test.js; activeclinic-clinic-onboarding.…` | PASS |
| QA-011 | `SH-TEN-01` | `tests/v8-shared-rbac-tenant-isolation.test.js; tests/v8-tenant-product-isolation.test.js; tests/v10-pc02-platform-con…` | `v8-shared-rbac-tenant-isolation.test.js; v8-tenant-product-isolation.test.js;…` | PASS |
| QA-012 | `SH-TEN-02` | `tests/v10-pc02-platform-consolidation-characterization.test.js; tests/v8-shared-rbac-tenant-isolation.test.js; tests/…` | `v10-pc02-platform-consolidation-characterization.test.js; v8-shared-rbac-tena…` | PASS |
| QA-013 | `SH-RBAC-01` | `tests/v8-shared-rbac-tenant-isolation.test.js; tests/blessboard-authorization.test.js; tests/activeclinic-batch2-rbac…` | `v8-shared-rbac-tenant-isolation.test.js; blessboard-authorization.test.js; ac…` | PASS |
| QA-014 | `SH-RBAC-02` | `tests/v2-02-bb-catalogue-only-rbac.test.js; tests/v2-02-legacy-rbac-removal.test.js; tests/v2-02-platform-admin-rbac-…` | `v2-02-bb-catalogue-only-rbac.test.js; v2-02-legacy-rbac-removal.test.js; v2-0…` | PASS |
| QA-015 | `SH-MED-01` | `tests/v10-pc08-platform-media-consolidation.test.js; tests/v2-shared-media-upload-parity.test.js; tests/blessboard-me…` | `v10-pc08-platform-media-consolidation.test.js; v2-shared-media-upload-parity.…` | PASS |
| QA-016 | `SH-MED-02` | `tests/v2-shared-media-upload-parity.test.js; tests/v2-01-universal-image-editor.test.js; tests/blessboard-media.test.…` | `v2-shared-media-upload-parity.test.js; v2-01-universal-image-editor.test.js; …` | PASS |
| QA-017 | `SH-MED-03` | `tests/blessboard-media.test.js; tests/v8-tenant-product-isolation.test.js; tests/v203-qa-automation-gaps.test.js` | `blessboard-media.test.js; v8-tenant-product-isolation.test.js; v203-qa-automa…` | PASS |
| QA-018 | `SH-PUB-01` | `tests/v10-pc10-publication-convergence.test.js; tests/v10-pc10b-ac-website-workflow-baseline.test.js; tests/v10-pc10b…` | `v10-pc10-publication-convergence.test.js; v10-pc10b-ac-website-workflow-basel…` | PASS |
| QA-019 | `SH-PUB-02` | `tests/blessboard-p0-publish-auth.test.js; tests/v10-pc10b-ac-website-workflow-baseline.test.js` | `blessboard-p0-publish-auth.test.js; v10-pc10b-ac-website-workflow-baseline.te…` | PASS |
| QA-020 | `SH-DFT-01` | `tests/v7-website-draft-live-integrity.test.js; tests/v2-01-unpublished-changes-panel.test.js; tests/phase3-website-ap…` | `v7-website-draft-live-integrity.test.js; v2-01-unpublished-changes-panel.test…` | PASS |
| QA-021 | `SH-WE-01` | `tests/v7-shared-website-editor.test.js; tests/v2-01-bb-inline-editor-parity.test.js; tests/shared-website-editor-wave…` | `v7-shared-website-editor.test.js; v2-01-bb-inline-editor-parity.test.js; shar…` | PASS |
| QA-022 | `SH-WE-02` | `tests/v2-01-shared-section-management.test.js; tests/v2-bb-leadership-section-management.test.js` | `v2-01-shared-section-management.test.js; v2-bb-leadership-section-management.…` | PASS |
| QA-023 | `SH-IMG-01` | `tests/v2-01-universal-image-editor.test.js; tests/v2-02-universal-image-editor-coverage.test.js; tests/v2-02-structur…` | `v2-01-universal-image-editor.test.js; v2-02-universal-image-editor-coverage.t…` | PASS |
| QA-024 | `SH-IMG-02` | `tests/v2-02-structured-image-framing-lifecycle.test.js; tests/v2-bb-ministry-image-edit.test.js; tests/v2-bb-ministry…` | `v2-02-structured-image-framing-lifecycle.test.js; v2-bb-ministry-image-edit.t…` | PASS |
| QA-025 | `SH-VER-01` | `tests/v2-01-release-notes-center.test.js; tests/v7-getpro-testing-foundation.test.js; tests/v203-qa-automation-gaps.t…` | `v2-01-release-notes-center.test.js; v7-getpro-testing-foundation.test.js; v20…` | PASS |
| QA-026 | `SH-HOST-01` | `tests/v7-runtime-env-isolation.test.js; tests/activeclinic-unified-login.test.js; tests/v7-domain-resolved-platform.t…` | `v7-runtime-env-isolation.test.js; activeclinic-unified-login.test.js; v7-doma…` | PASS |
| QA-027 | `SH-HOST-02` | `tests/v7-runtime-env-isolation.test.js; tests/v7-getpro-testing-foundation.test.js` | `v7-runtime-env-isolation.test.js; v7-getpro-testing-foundation.test.js` | PASS |
| QA-028 | `BB-REG-01` | `tests/blessboard-instant-free-registration.test.js; tests/blessboard-register-church.test.js` | `blessboard-instant-free-registration.test.js; blessboard-register-church.test.js` | PASS |
| QA-029 | `BB-REG-02` | `tests/blessboard-growth-trial-registration.test.js` | `blessboard-growth-trial-registration.test.js` | PASS |
| QA-030 | `BB-REG-03` | `tests/blessboard-network-support-registration.test.js; tests/blessboard-growth-trial-expiry.test.js; tests/blessboard…` | `blessboard-network-support-registration.test.js; blessboard-growth-trial-expi…` | PASS |
| QA-031 | `BB-REG-04` | `tests/blessboard-registration-risk-review.test.js; tests/blessboard-registration-operator-approval.test.js` | `blessboard-registration-risk-review.test.js; blessboard-registration-operator…` | PASS |
| QA-032 | `BB-REG-05` | `tests/blessboard-registration-approval-checklist-ui.test.js; tests/blessboard-registration-approval-checklist.test.js…` | `blessboard-registration-approval-checklist-ui.test.js; blessboard-registratio…` | PASS |
| QA-033 | `BB-HQ-01` | `tests/blessboard-hq-shell.test.js; tests/blessboard-authorization.test.js` | `blessboard-hq-shell.test.js; blessboard-authorization.test.js` | PASS |
| QA-034 | `BB-BR-01` | `tests/blessboard-branch-admin-shell.test.js; tests/v8-shared-form-studio-authz.test.js` | `blessboard-branch-admin-shell.test.js; v8-shared-form-studio-authz.test.js` | PASS |
| QA-035 | `BB-BR-02` | `tests/blessboard-branch-admin-shell.test.js` | `blessboard-branch-admin-shell.test.js` | PASS |
| QA-036 | `BB-BR-03` | `tests/blessboard-branch-mini-websites.test.js; tests/blessboard-branch-mini-website-shell.test.js; tests/v203-qa-auto…` | `blessboard-branch-mini-websites.test.js; blessboard-branch-mini-website-shell…` | PASS |
| QA-037 | `BB-PUB-HOME` | `tests/blessboard-public-pages.test.js; tests/church-public-home-ministries-regression.test.js; tests/v203-qa-automati…` | `blessboard-public-pages.test.js; church-public-home-ministries-regression.tes…` | PASS |
| QA-038 | `BB-PAGE-HOME` | `tests/v2-bb-home-leaders-image.test.js; tests/v2-bb-home-leaders-text.test.js; tests/blessboard-public-pages.test.js` | `v2-bb-home-leaders-image.test.js; v2-bb-home-leaders-text.test.js; blessboard…` | PASS |
| QA-039 | `BB-PAGE-ABOUT` | `tests/blessboard-public-pages.test.js; tests/blessboard-content-admin.test.js` | `blessboard-public-pages.test.js; blessboard-content-admin.test.js` | PASS |
| QA-040 | `BB-PAGE-LEAD` | `tests/v2-bb-leadership-data-loss.test.js; tests/v2-bb-leadership-section-management.test.js; tests/v2-bb-home-leaders…` | `v2-bb-leadership-data-loss.test.js; v2-bb-leadership-section-management.test.…` | PASS |
| QA-041 | `BB-PAGE-MIN` | `tests/church-branch-ministries.test.js; tests/v2-bb-ministry-image-edit.test.js; tests/v2-bb-ministry-leader-image.te…` | `church-branch-ministries.test.js; v2-bb-ministry-image-edit.test.js; v2-bb-mi…` | PASS |
| QA-042 | `BB-PAGE-EVT` | `tests/church-growth-advanced-events.test.js; tests/church-branch-announcements-events.test.js; tests/church-public-ev…` | `church-growth-advanced-events.test.js; church-branch-announcements-events.tes…` | PASS |
| QA-043 | `BB-PAGE-SER` | `tests/v2-02-sermon-creation-regression.test.js; tests/v2-bb-sermon-image-persistence.test.js; tests/church-public-eve…` | `v2-02-sermon-creation-regression.test.js; v2-bb-sermon-image-persistence.test…` | PASS |
| QA-044 | `BB-ANN-01` | `tests/blessboard-announcements.test.js; tests/v8-shared-announcements.test.js` | `blessboard-announcements.test.js; v8-shared-announcements.test.js` | PASS |
| QA-045 | `BB-ANN-02` | `tests/v2-02-announcements-document-upload-regression.test.js` | `v2-02-announcements-document-upload-regression.test.js` | PASS |
| QA-046 | `BB-ANN-03` | `tests/blessboard-announcements.test.js; tests/blessboard-announcement-platform-admin-testing-policy.test.js` | `blessboard-announcements.test.js; blessboard-announcement-platform-admin-test…` | PASS |
| QA-047 | `BB-PAGE-CON` | `tests/v2-bb-contact-hours-edit.test.js; tests/v2-bb-contact-image-replace.test.js; tests/bb-contact-stitch.test.js` | `v2-bb-contact-hours-edit.test.js; v2-bb-contact-image-replace.test.js; bb-con…` | PASS |
| QA-048 | `BB-PAGE-GIV` | `tests/blessboard-giving.test.js; tests/blessboard-finance-separation.test.js; tests/church-public-giving-contact-visu…` | `blessboard-giving.test.js; blessboard-finance-separation.test.js; church-publ…` | PASS |
| QA-049 | `BB-MED-01` | `tests/blessboard-media.test.js; tests/v2-shared-media-type-conversion.test.js; tests/v2-shared-media-upload-parity.te…` | `blessboard-media.test.js; v2-shared-media-type-conversion.test.js; v2-shared-…` | PASS |
| QA-050 | `BB-CMS-01` | `tests/blessboard-content-admin.test.js; tests/v10-pc11-cms-convergence.test.js; tests/v10-pl05-canonical-cms.test.js;…` | `blessboard-content-admin.test.js; v10-pc11-cms-convergence.test.js; v10-pl05-…` | PASS |
| QA-051 | `BB-PUB-01` | `tests/blessboard-p0-publish-auth.test.js; tests/v7-blessboard-publish-engine-bridge.test.js; tests/blessboard-church-…` | `blessboard-p0-publish-auth.test.js; v7-blessboard-publish-engine-bridge.test.…` | PASS |
| QA-052 | `BB-PUB-02` | `tests/phase4-restore-previous-website.test.js; tests/phase3-website-version-compare-restore.test.js; tests/phase3-web…` | `phase4-restore-previous-website.test.js; phase3-website-version-compare-resto…` | PASS |
| QA-053 | `BB-RBAC-01` | `tests/blessboard-staff-invitation.test.js; tests/blessboard-hq-roles.test.js; tests/blessboard-rbac-e2e.test.js` | `blessboard-staff-invitation.test.js; blessboard-hq-roles.test.js; blessboard-…` | PASS |
| QA-054 | `BB-RBAC-02` | `tests/v2-02-legacy-rbac-removal.test.js; tests/v10-dbcl04-canonical-cleanup-baseline.test.js` | `v2-02-legacy-rbac-removal.test.js; v10-dbcl04-canonical-cleanup-baseline.test.js` | PASS |
| QA-055 | `BB-V202-IMG` | `tests/v2-02-universal-image-editor-coverage.test.js; tests/v2-02-structured-image-framing-lifecycle.test.js` | `v2-02-universal-image-editor-coverage.test.js; v2-02-structured-image-framing…` | PASS |
| QA-056 | `BB-V203-E2E` | `tests/v7-local-registration-to-website-e2e.test.js` | `v7-local-registration-to-website-e2e.test.js` | PASS |
| QA-057 | `BB-V203-REG` | `tests/v2-02-legacy-rbac-removal.test.js; tests/v2-02-bb-catalogue-only-rbac.test.js; tests/blessboard-auth-schema.tes…` | `npm run test:v203:bb-regression` | PASS |
| QA-058 | `AC-REG-01` | `tests/activeclinic-acw09-registration.test.js; tests/activeclinic-clinic-registration.test.js; tests/activeclinic-cli…` | `activeclinic-acw09-registration.test.js; activeclinic-clinic-registration.tes…` | PASS |
| QA-059 | `AC-REG-02` | `tests/activeclinic-registration-terms.test.js; tests/activeclinic-clinic-registration.test.js` | `activeclinic-registration-terms.test.js; activeclinic-clinic-registration.tes…` | PASS |
| QA-060 | `AC-SETUP-01` | `tests/activeclinic-batch1a-config.test.js` | `activeclinic-batch1a-config.test.js` | PASS |
| QA-061 | `AC-FAC-01` | `tests/activeclinic-batch2-facilities.test.js; tests/activeclinic-facility-foundation.test.js; tests/activeclinic-faci…` | `activeclinic-batch2-facilities.test.js; activeclinic-facility-foundation.test…` | PASS |
| QA-062 | `AC-FAC-02` | `tests/activeclinic-batch2-rbac-isolation.test.js` | `activeclinic-batch2-rbac-isolation.test.js` | PASS |
| QA-063 | `AC-STAFF-01` | `tests/activeclinic-staff-invitation.test.js; tests/activeclinic-roles-access-admin.test.js; tests/activeclinic-roles-…` | `activeclinic-staff-invitation.test.js; activeclinic-roles-access-admin.test.j…` | PASS |
| QA-064 | `AC-STAFF-02` | `tests/activeclinic-staff-invitation.test.js` | `activeclinic-staff-invitation.test.js` | PASS |
| QA-065 | `AC-DEPT-01` | `tests/activeclinic-batch2-facilities.test.js` | `activeclinic-batch2-facilities.test.js` | PASS |
| QA-066 | `AC-PAT-01` | `tests/activeclinic-batch1a-patient-reception.test.js; tests/activeclinic-batch2-patient-workspace.test.js` | `activeclinic-batch1a-patient-reception.test.js; activeclinic-batch2-patient-w…` | PASS |
| QA-067 | `AC-PAT-02` | `tests/activeclinic-patient-foundation.test.js; tests/activeclinic-patient-merge-safety.test.js; tests/activeclinic-pa…` | `activeclinic-patient-foundation.test.js; activeclinic-patient-merge-safety.te…` | PASS |
| QA-068 | `AC-APT-01` | `tests/activeclinic-batch1a-appointments.test.js; tests/activeclinic-batch2-appointments-workspace.test.js` | `activeclinic-batch1a-appointments.test.js; activeclinic-batch2-appointments-w…` | PASS |
| QA-069 | `AC-APT-02` | `tests/activeclinic-batch2-rbac-isolation.test.js` | `activeclinic-batch2-rbac-isolation.test.js` | PASS |
| QA-070 | `AC-BOOK-01` | `tests/activeclinic-public-booking.test.js; tests/activeclinic-mf10-booking.test.js; tests/activeclinic-batch1a-appoin…` | `activeclinic-public-booking.test.js; activeclinic-mf10-booking.test.js; activ…` | PASS |
| QA-071 | `AC-BOOK-02` | `tests/activeclinic-patient-portal.test.js; tests/activeclinic-mf08-patient-registration.test.js; tests/activeclinic-b…` | `activeclinic-patient-portal.test.js; activeclinic-mf08-patient-registration.t…` | PASS |
| QA-072 | `AC-CLIN-01` | `tests/activeclinic-batch1a-clinical.test.js; tests/activeclinic-batch2-clinical-encounter.test.js` | `activeclinic-batch1a-clinical.test.js; activeclinic-batch2-clinical-encounter…` | PASS |
| QA-073 | `AC-CLIN-02` | `tests/activeclinic-batch3-acn17-acn19.test.js` | `activeclinic-batch3-acn17-acn19.test.js` | PASS |
| QA-074 | `AC-CLIN-03` | `tests/activeclinic-batch3-acn18-clinical-documents.test.js` | `activeclinic-batch3-acn18-clinical-documents.test.js` | PASS |
| QA-075 | `AC-CLIN-04` | `tests/activeclinic-batch3-acn17-acn19.test.js` | `activeclinic-batch3-acn17-acn19.test.js` | PASS |
| QA-076 | `AC-CLIN-05` | `tests/activeclinic-batch3-acn20.test.js` | `activeclinic-batch3-acn20.test.js` | PASS |
| QA-077 | `AC-PHARM-01` | `tests/activeclinic-batch2-operational-queues.test.js; tests/activeclinic-pharmacy-foundation.test.js; tests/activecli…` | `activeclinic-batch2-operational-queues.test.js; activeclinic-pharmacy-foundat…` | PASS |
| QA-078 | `AC-LAB-01` | `tests/activeclinic-batch2-operational-queues.test.js; tests/activeclinic-diagnostics-foundation.test.js; tests/active…` | `activeclinic-batch2-operational-queues.test.js; activeclinic-diagnostics-foun…` | PASS |
| QA-079 | `AC-RAD-01` | `tests/activeclinic-batch2-operational-queues.test.js; tests/activeclinic-diagnostics-foundation.test.js; tests/active…` | `activeclinic-batch2-operational-queues.test.js; activeclinic-diagnostics-foun…` | PASS |
| QA-080 | `AC-BILL-01` | `tests/activeclinic-batch1a-billing.test.js; tests/activeclinic-batch2-billing.test.js; tests/v203-qa-automation-gaps.…` | `activeclinic-batch1a-billing.test.js; activeclinic-batch2-billing.test.js; v2…` | PASS |
| QA-081 | `AC-BILL-02` | `tests/activeclinic-batch1a-billing.test.js; tests/activeclinic-finance-rbac.test.js` | `activeclinic-batch1a-billing.test.js; activeclinic-finance-rbac.test.js` | PASS |
| QA-082 | `AC-RBAC-01` | `tests/activeclinic-batch2-rbac-isolation.test.js; tests/activeclinic-roles-access-admin.test.js; tests/activeclinic-r…` | `activeclinic-batch2-rbac-isolation.test.js; activeclinic-roles-access-admin.t…` | PASS |
| QA-083 | `AC-WEB-01` | `tests/v10-pc10b-ac-website-workflow-baseline.test.js; tests/activeclinic-website-cms.test.js; tests/activeclinic-webs…` | `v10-pc10b-ac-website-workflow-baseline.test.js; activeclinic-website-cms.test…` | PASS |
| QA-084 | `AC-PUB-01` | `tests/activeclinic-public-website.test.js; tests/activeclinic-clinic-website-availability.test.js; tests/activeclinic…` | `activeclinic-public-website.test.js; activeclinic-clinic-website-availability…` | PASS |
| QA-085 | `AC-PORT-01` | `tests/activeclinic-patient-portal.test.js; tests/activeclinic-batch3-acp03-acp07.test.js; tests/activeclinic-batch3-a…` | `activeclinic-patient-portal.test.js; activeclinic-batch3-acp03-acp07.test.js;…` | PASS |
| QA-086 | `AC-PORT-02` | `tests/activeclinic-batch3-acp05-visit-summary.test.js` | `activeclinic-batch3-acp05-visit-summary.test.js` | PASS |
| QA-087 | `AC-ROOM-01` | `tests/activeclinic-batch3-acn27-rooms.test.js` | `activeclinic-batch3-acn27-rooms.test.js` | PASS |
| QA-088 | `AC-B1-NAV` | `tests/activeclinic-batch1a-appointments.test.js; tests/activeclinic-batch1a-billing.test.js; tests/activeclinic-batch…` | `activeclinic-batch1a-appointments.test.js; activeclinic-batch1a-billing.test.…` | PASS |
| QA-089 | `AC-B2-NAV` | `tests/activeclinic-batch2-appointments-workspace.test.js; tests/activeclinic-batch2-billing.test.js; tests/activeclin…` | `activeclinic-batch2-appointments-workspace.test.js; activeclinic-batch2-billi…` | PASS |
| QA-090 | `AC-B3-NAV` | `tests/activeclinic-batch3-acn17-acn19.test.js; tests/activeclinic-batch3-acn18-clinical-documents.test.js; tests/acti…` | `activeclinic-batch3-acn17-acn19.test.js; activeclinic-batch3-acn18-clinical-d…` | PASS |
| QA-091 | `AC-V203-E2E` | `tests/v203-end-to-end-journeys.test.js` | `tests/v203-end-to-end-journeys.test.js (journey map)` | PASS |
| QA-092 | `PL-DB-01` | `tests/db-bootstrap-foundation.test.js; tests/db-foundation.test.js; tests/v10-dbcl11-post-cleanup-fresh-bootstrap.tes…` | `db-bootstrap-foundation.test.js; db-foundation.test.js; v10-dbcl11-post-clean…` | PASS |
| QA-093 | `PL-DB-02` | `tests/migration-tooling.test.js; tests/v5-to-v7-migration-tooling.test.js` | `migration-tooling.test.js; v5-to-v7-migration-tooling.test.js` | PASS |
| QA-094 | `PL-ADM-01` | `tests/v7-platform-admin-tenant-health.test.js; tests/v7-platform-admin-website-control.test.js; tests/blessboard-anno…` | `v7-platform-admin-tenant-health.test.js; v7-platform-admin-website-control.te…` | PASS |
| QA-095 | `PL-ENT-01` | `tests/platform-entitlements.test.js; tests/phase4-website-plan-entitlements.test.js` | `platform-entitlements.test.js; phase4-website-plan-entitlements.test.js` | PASS |
| QA-096 | `PL-PUB-01` | `tests/v10-pc10b-ac-website-workflow-baseline.test.js; tests/v10-pc10b-bb-publish-baselines.test.js; tests/v10-pc10-pu…` | `v10-pc10b-ac-website-workflow-baseline.test.js; v10-pc10b-bb-publish-baseline…` | PASS |
| QA-097 | `PL-MED-01` | `tests/v10-pc08-platform-media-consolidation.test.js` | `v10-pc08-platform-media-consolidation.test.js` | PASS |
| QA-098 | `PL-SEC-01` | `tests/v8-shared-rbac-tenant-isolation.test.js; tests/blessboard-p0-publish-auth.test.js` | `v8-shared-rbac-tenant-isolation.test.js; blessboard-p0-publish-auth.test.js` | PASS |

## Marker

```text
V2_03_98_QA_SCENARIO_EXPORT_PASS
RELEASE_SHA=5e2e77074ee6375834a9089a306df5d5c383aea9
TOTAL_SCENARIOS=98
PLATFORM_SHARED=34
BLESSBOARD=30
ACTIVECLINIC=34
PASS=98
FAIL=0
SKIPPED=0
DUPLICATE_QA_IDS=0
DUPLICATE_SCENARIOS=0
UNTRACEABLE_SCENARIOS=0
INVENTED_SCENARIOS=0
PRODUCTION=UNTOUCHED
```
