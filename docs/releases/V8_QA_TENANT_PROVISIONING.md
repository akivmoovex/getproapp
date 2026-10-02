# V8 Disposable QA Tenant Provisioning (PROMPT 27)

**Verdict:** `V8_QA_TENANTS_READY`  
**Branch:** `V8` only  
**Recorded:** 2026-09-21  
**Deployment:** `moovex-platform-v8-testing`  
**Database:** `moovex-platform-v7` / `testing`  
**Migration tips confirmed:** platform **042** · BlessBoard **112**

### Explicit non-actions

| Action | Performed? |
|--------|------------|
| Deploy / restart / apply migrations | **No** |
| Modify production | **No** |
| Modify V7 deployments or long-lived demo/customer tenants | **No** |
| Send external invitations / SMS / email | **No** |
| Print passwords, OTPs, session cookies | **No** |
| Claim dedicated church hostnames as working | **No** (none routable) |

---

## 1. Safety (Step 1)

| Check | Result |
|-------|--------|
| Branch | `V8` |
| Live V8 `/healthz` deploymentCode | `moovex-platform-v8-testing` (neuniversity hosts) |
| DB identity | `moovex-platform-v7` / `testing` |
| Tips | platform `042`, blessboard `112`, activeclinic `035` |
| V7 hosts | Unchanged (`03a89106e2fe` / `moovex-platform-testing`) |

**Services reused (no arbitrary tenant SQL inserts):**

- `provisionPlatformTenant` · `provisionBlessBoardChurch` · `createBlessBoardBranch`
- `createBlessBoardUser` · `assignBlessBoardRole` · catalogue assignment via `blessBoardRbacRepository`
- `assignOrganizationPlan` / `setOrganizationEntitlementOverride`
- `submitAndProvisionClinicRegistration` · `prepareHostedAuthQaBookable` · `publishHostedAuthQaWebsite`
- Auth verify: `authenticateBlessBoardUser` · `authenticateActiveClinicIdentity`

Ops entrypoint: `db/scripts/v8-disposable-qa-tenant-provision.js` (dry-run default; `--confirm` writes).

---

## 2. Provisioned disposable tenants (non-sensitive)

### BlessBoard

| Field | Value |
|-------|-------|
| Organization / church key | `bb-v8qa-mub23a6v6a6b` |
| Display name | `V8 QA Church mub23a6v6a6b` |
| `test_cleanup_eligible` | **true** |
| Deployment binding | `moovex-platform-v8-testing` |
| Branches | `hq` (Headquarters), `campus-a` (Campus A), `campus-b` (Campus B) |
| Domain row | **None** (`skipDomain: true`) |
| Working staff URL | `https://blessboard.neuniversity.org/login` |
| Dedicated tenant hostname | **Not available** — see §4 |

**Roles / identities (emails only):**

| Role | Email | Platform login |
|------|-------|----------------|
| HQ administrator | `hq.admin@bb-v8qa-mub23a6v6a6b.example.invalid` | Yes (legacy `church_hq_admin` + catalogue `organisation_administrator`) |
| Branch administrator (`campus-a`) | `branch.admin@bb-v8qa-mub23a6v6a6b.example.invalid` | Yes (`branch_admin` + `branch_administrator`) |
| Membership reviewer | `membership.reviewer@bb-v8qa-mub23a6v6a6b.example.invalid` | Yes (`church_hq_admin` + `first_timers_coordinator`) |
| Visitor test identity | `visitor@bb-v8qa-mub23a6v6a6b.example.invalid` | **No** (email persona only) |
| Member-applicant identity | `member.applicant@bb-v8qa-mub23a6v6a6b.example.invalid` | **No** (email persona only) |

### ActiveClinic

| Field | Value |
|-------|-------|
| Organization / clinic key | `ac-v8-qa-mub23a6v6a6b` |
| Display name | `Ac V8 Qa mub23a6v6a6b` |
| `test_cleanup_eligible` | **true** |
| Admin email | `clinic.admin@ac-hqa-v8mub23a6v6a6b.example.invalid` |
| Working staff URL | `https://activeclinic.neuniversity.org/login` |
| Public clinic URL | `https://activeclinic.neuniversity.org/clinics/ac-v8-qa-mub23a6v6a6b` |
| Bookable consultation service | **Yes** (after post-provision prepare) |
| Website published | **Yes** |

---

## 3. Credentials (Step 3)

| Item | Result |
|------|--------|
| Creation path | Supported user/registration services |
| Delivery | Written **only** to gitignored `.env.v8-qa-tenants.local` (mode `0600`) |
| Printed in this report / git / logs | **No** |
| External invite / OTP delivery | **Not used** (`.example.invalid` addresses) |

Operators with repo checkout + testing DB env can load `.env.v8-qa-tenants.local` locally. Values are never committed.

---

## 4. Verification (Step 4)

| Check | Result | Evidence |
|-------|--------|----------|
| BB HQ authorized login | **PASS** | POST `/login` → `/hq/onboarding`; `/hq` · `/hq/forms` · `/hq/members` · `/hq/announcements` **200** |
| BB branch admin login | **PASS** | `/branch-admin` **200**; `/hq` as branch admin **403** |
| AC clinic admin login | **PASS** | POST `/login` → `/app` **200** |
| AC public clinic route | **PASS** | `/clinics/ac-v8-qa-mub23a6v6a6b` **200** |
| Cross-role isolation (branch ↛ HQ) | **PASS** | Branch session `/hq` → **403** |
| V8 session cookie isolation vs V7 | **PASS** | Cookies `moovex_platform_v8_testing_sid` / `_csrf` only — no `*_pronline_*` cookies |
| Invented church hostname | **Not routable** | `bb-v8qa-….blessboard.neuniversity.org` → DNS NXDOMAIN (expected) |
| V7 hosts still operational | **PASS** | pronline `/healthz` still `03a89106e2fe` · `moovex-platform-testing` · `schemaCompatible=true` |

### Remaining blockers (do not block “tenants ready” for staff admin QA)

1. **No BlessBoard church tenant hostname under neuniversity** — `canonicalHostRegistry` is exact-match; Hostinger DNS + allowlist + deploy would be required for authoritative public `/register`, tenant `/announcements`, and member portal host routing. Admin QA uses **session-scoped tenant** on `blessboard.neuniversity.org` instead.
2. **`GET /hq/membership` → 503** Unavailable on product host after successful HQ login (while `/hq/members` works). Likely `rejectApex` / tenant-resolution mismatch for the V8 membership workflow router — track as follow-up before claiming membership write-flow PASS.
3. Secure credential file is **local-only**; other operators need a secure handoff of `.env.v8-qa-tenants.local` (or re-run provision).

---

## 5. Fixture note

`src/activeclinic/qa/activeClinicHostedAuthQaFixture.js` allowlist extended with prefix `ac-v8-qa-` so disposable V8 clinic keys remain eligible for bookable/publish helpers without widening to arbitrary orgs.

---

## 6. Return token

```
V8_QA_TENANTS_READY
```

Staff admin identities for BB HQ/branch and AC clinic are provisioned, marked disposable, and verified on hosted V8 with V7 untouched. Tenant-hostname-dependent public church flows remain blocked until DNS + host allowlisting exist.
