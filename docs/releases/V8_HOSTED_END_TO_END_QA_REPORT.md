# V8 Hosted End-to-End QA Report (PROMPT 29)

**Verdict:** `V8_HOSTED_QA_WITH_OPEN_DEFECTS`  
**Branch:** `V8` only  
**Recorded:** 2026-09-21  
**Target deployment:** `moovex-platform-v8-testing` (neuniversity hosts only)  
**Testing DB:** `moovex-platform-v7` / `testing`  
**Tenants used:** disposable V8 QA only (`bb-v8qa-mub23a6v6a6b`, `ac-v8-qa-mub23a6v6a6b`)

### Explicit non-actions

| Action | Performed? |
|--------|------------|
| Write against customer / V7 production tenants | **No** |
| Activate or send real notifications | **No** |
| Apply migrations / restart / deploy application code | **No** |
| Modify V7 code or deployments | **No** |
| Claim 84-screen hosted visual PASS | **No** — only surfaces actually rendered were counted |

---

## 1. SHA and environment

| Role | Value |
|------|-------|
| **Live hosted `/healthz` gitSha** | `63adbe91cc7a` |
| **Local `origin/V8` tip at QA start** | `63adbe91cc7a` |
| **V8 deploymentCode** | `moovex-platform-v8-testing` |
| **expectedIdentityKey** | `moovex-platform-v7` |
| **schemaCompatible** | `true` (all three neuniversity hosts) |
| **Migration tips** | platform **042** · BlessBoard **112** · ActiveClinic **035** |
| **V7 hosted SHA** | `03a89106e2fe` (`moovex-platform-testing` on pronline) |

### Live health matrix

| Host | `/healthz` | gitSha | deploymentCode | schemaCompatible |
|------|------------|--------|----------------|------------------|
| `https://neuniversity.org` | 200 ok | `63adbe91cc7a` | `moovex-platform-v8-testing` | true |
| `https://blessboard.neuniversity.org` | 200 ok | `63adbe91cc7a` | `moovex-platform-v8-testing` | true |
| `https://activeclinic.neuniversity.org` | 200 ok | `63adbe91cc7a` | `moovex-platform-v8-testing` | true |
| `https://blessboard.pronline.org` (V7) | 200 ok | `03a89106e2fe` | `moovex-platform-testing` | true |
| `https://activeclinic.pronline.org` (V7) | 200 ok | `03a89106e2fe` | `moovex-platform-testing` | true |

### Disposable tenant gate

| Check | Result |
|-------|--------|
| BB org key | `bb-v8qa-mub23a6v6a6b` |
| AC org key | `ac-v8-qa-mub23a6v6a6b` |
| Staff credentials | Present in gitignored `.env.v8-qa-tenants.local` |
| Dedicated church hostname | **None** (product-hub session tenant only) |
| Write testing scope | Disposable V8 QA tenants only |

---

## 2. Twelve user flows — results

Legend: **PASS** = hosted persistence + auth/isolation verified · **PARTIAL** = meaningful hosted evidence with gaps · **FAIL** = defect with repro · **BLOCKED** = missing tenant hostname / blocked dependency.

| # | Flow | Result | Hosted route(s) / evidence | Persistence | Auth / isolation | Desktop 1440 / Mobile 390 |
|---|------|--------|----------------------------|-------------|------------------|---------------------------|
| 01 | Shared form create → publish → share | **FAIL** | `/hq/form-studio/new` and `/branch-admin/form-studio/new` render SH15 **Access denied** (HTTP 200 soft deny; no CSRF create form). Roles include `organisation_administrator`, `church_system_administrator`, `branch_administrator` with catalogue `requests.manage` — soft gate still denies. | Not tested | Soft deny despite catalogue grants | Denial screen inspected |
| 02 | Public form submit + confirm | **BLOCKED** | No published `/f/…` URL (depends on 01) | — | — | — |
| 03 | Submission review + status | **BLOCKED** | Depends on 02 | — | — | — |
| 04 | Shared form admin + tenant isolation | **PASS** | Branch admin → `/hq/form-studio` **403** “You do not have access to this site.”; `/hq/members` **403**. HQ announcements write succeeded only on disposable BB org. | N/A (isolation) | Branch cannot enter HQ surfaces | Isolation HTTP verified |
| 05 | Four-step membership application | **BLOCKED** | No church tenant hostname; product-hub `/register` **404** (controlled fail-closed after PROMPT 28) | — | — | — |
| 06 | Membership review + approval | **FAIL** | `GET /hq/membership` → **503** foundation: “This page is not yet available in BlessBoard V5.” `/hq/members` **200** directory reachable. | Directory reload 200 | HQ session | Members list inspected (HTTP + admin shell) |
| 07 | Member management + branch transfers | **PARTIAL** | `/hq/members` **200**; `/branch-admin/members` **200** (empty roll; transfer UI present with 0 open). Transfers not exercised (no members). | Lists reload | HQ + branch roles | Branch members **1440** screenshot |
| 08 | Visitor registration + follow-up | **BLOCKED** | Requires tenant hostname | — | — | — |
| 09 | Event / ministry registration | **BLOCKED** | Requires tenant hostname | — | — | — |
| 10 | Shared / HQ announcement create → publish | **PASS** | `POST /hq/announcements` created draft `e7f3046d-94a9-4286-916e-fb179ffba35e`; publish → detail reload shows **published** | Reload confirmed published | HQ admin | Detail HTTP 200 |
| 11 | BB HQ/branch announcement management | **PARTIAL** | `/hq/announcements` **200**; `/branch-admin/announcements` **200** (Create announcement control present). `/hq/announcement-studio` soft/hard gated (**403**/denied). | HQ publish persisted | HQ + branch | Branch announcements shell inspected |
| 12 | Public church announcement list + detail | **BLOCKED** | Product-hub `/announcements` → **503** foundation; no tenant hostname for BB19–BB22 | — | — | — |

**Summary counts:** PASS **2** · PARTIAL **2** · FAIL **2** · BLOCKED **6**

---

## 3. Screen visual verification

**Do not claim 84-screen PASS.** Approved package size remains **84** Stitch D/M screens; this pass visually verified a **subset of hosted surfaces** only.

| Metric | Count |
|--------|------:|
| Approved package screens (SH/BB/AN × D/M) | **84** |
| Hosted surfaces **visually rendered and inspected** this pass | **12** |
| Remaining Stitch IDs not visually verified on hosted V8 | **72+** |

### Surfaces actually rendered and inspected

| Surface | Desktop 1440 | Mobile 390 | Notes |
|---------|--------------|------------|-------|
| BB `/login` | Yes (snapshot) | — | Sign-in shell |
| Branch admin `/branch-admin` | Yes + screenshot | Yes + screenshot | Campus A Daily Pulse |
| Branch `/branch-admin/members` | Yes + screenshot | — | Empty roll + transfer/review widgets |
| Branch `/branch-admin/announcements` | Snapshot | — | Create announcement CTA |
| Branch `/branch-admin/form-studio` | Yes + screenshot | — | SH15 Access denied |
| HQ `/hq/announcements` (+ published detail) | HTTP + title | — | Persistence after publish |
| HQ `/hq/members`, `/hq/branches` | HTTP | — | Reachable admin shells |
| AC `/clinics` directory | Yes + screenshot | Narrow layout observed | Includes disposable `Ac V8 Qa mub23a6v6a6b` |
| AC disposable clinic home | Yes + screenshot | — | Book Appointment CTA |
| AC disposable `/services` | Snapshot | — | QA consultation listed |
| AC disposable `/doctors`, `/book`, `/contact` | HTTP 200 | — | Forms/CSRF present |
| AC `/app` (clinic admin) | HTTP 200 after login | — | Authenticated shell |

Authenticated roles exercised: **BB HQ admin**, **BB branch admin**, **AC clinic admin**, plus unauthenticated public AC/BB probes.

---

## 4. Persistence results

| Artifact | Result |
|----------|--------|
| HQ announcement `e7f3046d-94a9-4286-916e-fb179ffba35e` | **Persisted** — reload status 200, body shows published |
| Shared form create/publish/submit | **Not achieved** (form-studio soft deny) |
| Membership application / approval | **Not achieved** (hostname + `/hq/membership` 503) |
| AC contact inquiry | **Persisted path** — POST → `/clinics/ac-v8-qa-mub23a6v6a6b/contact/success` (200) |
| AC booking submit | **Not successful** — POST `/book` → **400** (validation/incomplete slot payload on disposable clinic) |

---

## 5. Authorization and isolation results

| Check | Result |
|-------|--------|
| Branch admin → HQ form-studio / HQ members | **403** denied (PASS isolation) |
| HQ → disposable announcement write | Allowed after role grants |
| Form-studio `canView`/`canManage` | **FAIL** — soft Access denied even with catalogue `requests.*` on HQ/branch roles. Root cause: `registerBlessBoardSharedFormRoutes` reads `req.blessBoardAuthorizationContext.permissions`, but `authorizeBlessBoardTenantAccess` context does **not** populate `permissions` (only `effectiveRoles`). Middleware `createRequireBlessBoardPermission` can still authorize via RBAC service, so legacy Forms/Requests shells work while shared Form Studio denies. |
| Product-hub vs tenant public routes | Public membership/announcements/visitor/event flows remain hostname-bound |

---

## 6. Regression results

| Item | Result | Evidence |
|------|--------|----------|
| AC booking form GET | **PASS** (render) | Disposable clinic `/book` 200 + CSRF |
| AC booking submit | **PARTIAL/FAIL** | POST **400** on disposable clinic (not 403 freeze) |
| AC inquiry submit | **PASS** | Contact → `/contact/success` 200 |
| AC services | **PASS** | Disposable `/services` lists QA consultation |
| AC doctor profiles | **PARTIAL** | `/doctors` 200; empty public profiles messaging |
| AC directory navigation | **PASS** | `/clinics` 200 with disposable clinic card; `/directory` **404** (expected alternate) |
| Shared phone reuse probe | **PARTIAL** | Reused phone on contact still succeeded (no conflict surface observed) |
| BB/AC media delivery | **PASS** | Brand PNG + Julflona hero JPG **200** on V8 hosts |
| Product-hub `/register` | **PASS** (fail-closed) | BlessBoard product hub **404**; apex **404**; `/register-church` **200** |
| V7 health / schema | **PASS** | `03a89106e2fe`, schemaCompatible true; V7 untouched |

---

## 7. Remaining defects (severity)

| ID | Severity | Summary |
|----|----------|---------|
| **V8-QA-FORM-STUDIO-PERMS** | **High** | Shared Form Studio always soft-denies because `canView`/`canManage` check missing `permissions` on authz context (`registerBlessBoardSharedFormRoutes.js` vs `authorizeBlessBoardTenantAccess.js`). Blocks flows 01–03. |
| **V8-QA-HQ-MEMBERSHIP-503** | **High** | `/hq/membership` returns foundation 503 on product-hub session tenant. Blocks flow 06 write path. |
| **V8-QA-NO-CHURCH-HOSTNAME** | **High** (infra) | No routable disposable church hostname under neuniversity → flows 05, 08, 09, 12 blocked. |
| **V8-QA-ANNOUNCEMENT-STUDIO-GATE** | **Medium** | `/hq/announcement-studio` gated while classic `/hq/announcements` works (flow 11 PARTIAL). |
| **V8-QA-AC-BOOK-SUBMIT-400** | **Medium** | Disposable clinic booking POST returns 400 with exercised fields; needs slot/service wiring or validation message audit. |
| **V8-QA-HQ-ONBOARDING-STICKY** | **Low** | HQ login lands on `/hq/onboarding`; skip loop leaves sticky onboarding UI though `/hq` still reachable. |

---

## 8. Evidence artifacts

| Artifact | Location |
|----------|----------|
| Automated auth/write probe JSON | `/tmp/v8-auth-qa/auth-qa-full.json` (local; not committed) |
| Repro script | `scripts/local/v8-hosted-auth-qa-prompt29.js` (reads `.env.v8-qa-tenants.local`) |
| Browser screenshots | Cursor screenshots: branch admin/members/announcements/form-deny; AC clinic + directory |

---

## 9. Verdict statement

Hosted SHA **`63adbe91cc7a`** on **`moovex-platform-v8-testing`** was exercised with disposable V8 QA identities. **2/12** flows fully PASS; **6/12** remain BLOCKED on church hostname / form-studio; **2 FAIL** with reproducible defects; **2 PARTIAL**. **12** hosted surfaces were visually inspected — **not** 84. Therefore:

### `V8_HOSTED_QA_WITH_OPEN_DEFECTS`
