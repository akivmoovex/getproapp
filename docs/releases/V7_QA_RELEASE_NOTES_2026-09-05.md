# BB+AC V7 QA Release Notes

**Release date:** September 5, 2026  
**Branch:** `V7`  
**Environment:** QA / Testing  
**Primary testing hosts:**

* `https://activeclinic.pronline.org`
* `https://blessboard.pronline.org`

**Production promotion:** Not part of this QA release note. Production promotion remains an explicit operator-controlled step through `V7-first-production`.

---

## Release summary

Today’s V7 QA work concentrated on closing release-blocking and release-certification gaps across **ActiveClinic**, **BlessBoard**, and the shared registration/platform layer.

Major outcomes:

* ActiveClinic registration validation hardened.
* ActiveClinic email and phone login remain functional.
* ActiveClinic service management and public service catalogue workflows were brought to working QA state.
* ActiveClinic media validation was strengthened.
* ActiveClinic editor save/publish error handling was hardened for network interruptions.
* ActiveClinic fresh-clinic editor certification false-negative was resolved.
* ActiveClinic CMS publish CSRF handling was corrected.
* ActiveClinic clinic/editor cache policy was hardened.
* ActiveClinic automated release regression gate was introduced and validated.
* BlessBoard production-registration investigation identified a missing deployment catalogue row as the real root cause of the earlier fail-then-retry behavior.
* BlessBoard registration provisioning/error handling was hardened.
* BlessBoard blank registration errors and misleading provisioning-stage reporting were corrected.
* Shared registration observability and public-safe error handling were improved.
* Multi-worker session handling was verified safe for registration.
* Several remaining operational/configuration debts were identified for later production work.

---

## ActiveClinic changes/fixes

### Registration phone validation

Extremely short phone numbers (including 3- and 4-digit values) could previously proceed through clinic registration. Phone validation was hardened so registration rejects clearly invalid short/malformed numbers while continuing to accept supported valid numbers. Validation covers the normal registration path rather than relying solely on browser-side checks.

Manual QA: blank / 3-digit / 4-digit / malformed rejected; valid phone accepted; email and phone login after registration passed.

### Password recovery

Recovery application logic passed the QA gate for recovery page, known/unknown identity handling, token rules, and anti-enumeration behavior. Unknown identifiers intentionally receive a neutral success-style response (anti-account-enumeration), provided no recovery token/message is created for an unknown identity.

**Not certified:** live email receipt remains `RECOVERY_DELIVERY_CONFIGURATION_PENDING` (testing lacks live Resend/SMTP credentials). This is configuration debt, not a proven application failure.

### Service management

Clinic services and public catalogue add/edit flows were brought into the release gate. Validated: view, add, edit, disable, public visibility, unauthorized-access restrictions, and public services rendered from the clinic catalogue (**7/7 PASS**).

### Media / image validation

Invalid, unsupported, corrupt, or oversized media handling was hardened. Coverage included valid image handling, corrupt/spoofed media, JPEG/PNG/WebP, oversized behavior, and logo/hero paths. Result: `MEDIA VALIDATION: PASS`.

### Editor reliability

An earlier “fresh-clinic editor unusable” certification failure was a **false-negative in the certification harness** (first pencil was an image/logo field; harness waited for text-only `[data-website-input]`). Application editor already rendered correctly (~32 editable keys / ~29 pencils).

### CMS publish CSRF

Real defect: CMS publish used `fetch(FormData)` (multipart); CSRF middleware expected a body-parsed token → `403 {"code":"csrf"}`, especially on publish retry after network interruption. Publishing request/CSRF handling was corrected so the token is available in the form expected by the server. Hosted: publish, disconnect, reconnect/retry (HTTP 200), and public update all PASS.

### Clinic/editor cache hardening

Routes under `/clinics/*` use private no-cache/no-store semantics (`Cache-Control: private, no-store, no-cache, must-revalidate`) so unpublished/editor HTML is not reused from anonymous CDN cache.

### Network failure handling

Save interruption: no false success, value retained, clear failure UX, retry works → `NET_SAVE_DISCONNECT_PASS`.  
Publish interruption: no false success, draft recoverable, error UX, retry succeeds, public changes only after success → `PASS`.

### Responsive editor

Fresh-clinic editor controls rechecked at desktop 1440px and mobile 390px → `PASS`.

### Automated regression gate

Repository uses `node --test` (not Mocha). Apparent hangs were incorrect execution (`npx mocha`, unsupported `--grep`, piping TAP through `tail`). New tooling:

* `scripts/run-activeclinic-automated-regression.js`
* `tests/activeclinic-editor-client-contracts.test.js`
* `npm run test:activeclinic:v7-regression`

Curated gate: inventory control, Mocha/`--grep` rejection, stall watchdog, TAP summary, deterministic clean exit.

Application fix SHA referenced during hosted AC certification: `c786a49092d19d647cbe2ba5ce8d609ddafb86f1`.

---

## BlessBoard changes/fixes

### Registration provisioning incident (root cause)

Fail-then-retry on production-style registration was **not** multi-worker/session-state failure. First submission called `provisionPlatformTenant`, which looked up `platform.deployments` for `moovex-platform-production`. That catalogue row was missing → `deployment_not_found`. Application row had already committed; tenant provisioning rolled back → `FIRST_ATTEMPT_PARTIAL_WRITE` (application without org/user/branch/website). Once the production deployment catalogue row existed, fresh registration succeeded on first submission.

### Provisioning error handling

* Public-safe registration errors (no leak of `deployment_not_found` / `provision_failure`).
* Blank registration error banner when `formError && !fieldError` corrected.
* Invalid CSRF on confirmation stays on **review** stage with meaningful message.
* Provisioning-stage reporting corrected (no false `last_provision_stage=website_instance` on early failure).
* Submit button lifecycle/pageshow improved so failed/back-navigation does not leave controls permanently disabled.

### Registration observability

Structured tracking around request/registration flow, provisioning stages, public-safe error codes, worker PID, and transaction/provision outcomes (credentials/tokens not intended to be exposed).

### Session / multi-worker

Registration uses cookies (`bb_reg_draft`, `bb_reg_pwd`, HMAC CSRF) and authenticated sessions use PostgreSQL `platform.deployment_sessions` → `SESSION_STORE_MULTIWORKER_SAFE`. In-memory rate limiting remains per-worker and was not the observed failure.

Relevant fix commit reported during this work: `c7f0063758cc386d9067bf292843a29e0c6026cd`. Three unique hosted church registrations on this fix succeeded on the **first confirm POST**.

---

## Shared platform changes

* Shared safe registration error layer / public-safe messaging.
* Deployment catalogue row `moovex-platform-production` clarified as a **required provisioning dependency** (not optional debt). Absence yields `deployment_not_found` while startup/`/healthz` may still look healthy.
* Permanent bootstrap/seed should guarantee required production deployment catalogue records exist before customer registration is enabled (`db/seeds/008_moovex_platform_production_deployment.sql` on V7).

---

## Manual QA coverage

### ActiveClinic

* Phone validation matrix (blank / short / malformed / valid)
* Email and phone login after registration
* Password recovery page + known/unknown identity (delivery not e2e-certified)
* Services CRUD + public catalogue + unauthorized
* Media validation (formats, spoof, oversized, logo/hero)
* Fresh-clinic editor (desktop + mobile)
* Draft save + publish, including network disconnect/reconnect
* Cache-header verification for clinic/editor routes
* Public clinic page after publish

### BlessBoard

* Registration GET / validation / first-submit confirm
* Blank-error and CSRF review-stage behavior
* Login
* Website/admin landing
* Directory
* Hosted first-submit provisioning after catalogue repair

---

## Automated QA coverage

### ActiveClinic

* `npm run test:activeclinic:v7-regression` — curated node:test gate (103 PASS / 0 FAIL in prior closure run; re-run at freeze)
* Includes editor client contracts (CSRF-safe publish body, disconnect copy, private no-store clinic paths)
* Broader legacy inventory (143 PASS / 14 FAIL) remains classified as brittle assertion/inventory debt, not today’s product regressions

### BlessBoard / shared (targeted)

Suites covering registration, first-submit provisioning, error handling, identity/idempotency, email/phone login, and shared auth/registration (e.g. register-church, instant-free, phone-login, registration-phone, shared-auth-reg, unified-registration-engine, provisioning recovery / identity suites as applicable).

---

## Known debt

### ActiveClinic

* Live password-recovery email receipt: `RECOVERY_DELIVERY_CONFIGURATION_PENDING`
* Some broader legacy automated tests contain brittle expected-status/copy assumptions
* URL-collision and exact idempotent-retry scenarios were not individually rerun in one final manual certification (underlying automated coverage exists)

### BlessBoard

* Production `data_environment` derivation: code on V7 derives from authoritative deployment mode (`resolveRegistrationDataEnvironment`); **production certification / hosted verification of stamp behavior remains required** before broad public registration
* Permanent deployment-catalogue bootstrap: seed `008` exists on V7; **production catalogue must contain `moovex-platform-production` before enabling public registration**
* Rate limiting remains memory-local per worker
* Some production QA tenants/failed registration applications require an explicit cleanup/retention decision

### Shared tooling

* Legacy `db:verify:foundation` allowlist remains stale relative to current V7 schema/catalogue
* Test inventories should continue moving toward explicit product-specific release gates

---

## Testing status

| Surface | Status |
| --- | --- |
| ActiveClinic hosted QA | `ACTIVECLINIC_V7_RELEASE_CANDIDATE_READY_WITH_ACCEPTED_MAIL_DEBT` (prior certification); freeze re-validates regression + testing deploy smoke |
| BlessBoard registration | Core fail-then-retry fixed; first-submit verified after catalogue presence |
| Shared testing hosts | `*.pronline.org` / `moovex-platform-testing` |

Environment expectations for testing `/healthz`:

* `environment=testing`
* `deploymentCode=moovex-platform-testing`
* `schemaCompatible=true`
* `gitSha` = frozen V7 SHA

---

## Production blockers

**ActiveClinic**

* No unresolved product P0/P1 after final hosted QA certification
* Remaining: recovery mail provider configuration (accepted operational debt)

**BlessBoard (required before production release certification)**

1. Confirm production new churches stamp `data_environment=production` (V7 code derives from deployment profile; verify on production runtime)
2. Confirm permanent catalogue/bootstrap: `moovex-platform-production` row present and seed/bootstrap path applied on production
3. QA tenant cleanup/retention decision
4. Final production auth/regression smoke (operator-controlled; not part of this QA freeze)

---

## Branch / promotion policy

QA fixes belong on **`V7`**. Testing runs from **`V7`**.

Production release must remain explicitly controlled through **`V7-first-production`**.

Intended flow:

`V7 development/fixes`  
→ hosted QA on `*.pronline.org`  
→ release certification  
→ operator approval  
→ `V7-first-production`  
→ production deployment  
→ production smoke QA

No QA task should automatically update `V7-first-production` unless the operator explicitly authorizes production promotion.

---

## Overall September 5 QA assessment

Most important closed items: ActiveClinic short-phone validation, service/catalogue management, media validation, network-safe editor behavior, publish CSRF, clinic cache isolation, fresh-clinic editor certification, deterministic regression testing; BlessBoard provisioning root-cause diagnosis, public-safe/blank-error handling, provisioning-stage diagnostics, CSRF review behavior, first-submit reliability; shared deployment-catalogue dependency clarification.

**Current release posture**

* **ActiveClinic:** ready for production promotion after the regression harness is on `V7` and the exact resulting SHA is frozen, with recovery mail delivery accepted as operational configuration.
* **BlessBoard:** core registration failure fixed; production-specific `data_environment` verification and catalogue/bootstrap permanence remain before broad public registration.
* **V7 QA overall:** materially release-ready, with remaining work concentrated in production configuration/hygiene rather than core application workflows.
