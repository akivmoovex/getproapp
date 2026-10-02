# V2.01 Production QA Accounts

**Task:** `V2_01_PROD_QA_ACCOUNTS`  
**Date:** 2026-09-26  
**Mode:** Account preparation / verification only — **no product code changes**  
**Production hosts:** `https://blessboard.com` · `https://activeclinic.org`  
**Deployment:** `moovex-platform-production` · `environment=production` · `gitSha=03a89106e2fe`  
**DB identity:** `moovex-platform-v7` / `production`

---

## Verdict

### **READY**

Authorized disposable production QA personas exist for BlessBoard and ActiveClinic, are scoped to non-customer org keys, use the existing role model, and were login-verified on live production hosts on 2026-09-26.

| Persona | Status | Login verified |
| --- | --- | --- |
| BB admin | **READY** | Yes → `/hq` |
| BB restricted-role | **READY** | Yes → `/branch-admin` |
| AC clinic admin | **READY** | Yes → `/app` |
| AC restricted-role | **READY** | Yes → `/app` |
| AC patient/test | **READY** (optional portal) | Yes → `/clinics/…/patient` |

**Credentials:** operator vault only (see §7). **No passwords in this document.**

---

## 1. Hard rules

| Rule | Enforcement |
| --- | --- |
| No product code changes | This task writes docs + ops vault metadata only |
| No shared passwords in docs | Passwords live only under the operator vault path in §7 |
| No real customer accounts | Do **not** use Juflona, Kafue churches, Medici, Mocaadri, etc. |
| No testing seeders on production | `blessboard:seed-qa-role-users` / `activeclinic:seed-qa-role-users` **refuse production** |
| Existing role model only | Legacy BB login roles + catalogue assignments; AC staff role catalogue |
| Least privilege for restricted personas | Website-editor (not org/HQ admin) for restricted checks |
| Tenant scope from session/org membership | Never switch org by URL forgery |

---

## 2. Approved disposable tenants (production)

| Product | Organization key | Display name | `data_environment` | Primary scope unit | Notes |
| --- | --- | --- | --- | --- | --- |
| BlessBoard | `blessboard-disposable-qa-5e15ca` | BlessBoard Disposable QA 5e15ca | `production` | Branch `hq-campus-qa` | Prefer this BB tenant |
| ActiveClinic | `activeclinic-disposable-qa-bd9d83` | ActiveClinic Disposable QA bd9d83 | `production` | Facility `hq` | Prefer this AC tenant |

Public clinic path: `https://activeclinic.org/clinics/activeclinic-disposable-qa-bd9d83`  
BlessBoard staff surfaces: apex session on `https://blessboard.com` (no dedicated tenant hostname).

### Do not use for V2.01 prod QA

| Org key | Why |
| --- | --- |
| Any Kafue / Juflona / customer church or clinic | Real customer / pilot data |
| `demo-great-god-ministries`, `demo-medici-clinic`, `dem-kafue-medical-clinic` | Demo/customer-adjacent production orgs |
| `blessboard-production-qa-*`, `blessboard-p1-repro-*` with `data_environment=testing` | Mislabeled on production DB; cleanup candidates |
| `test-church-01`, `test-old-apostolic-church` | Non-authorized / ambiguous |
| V8 testing tenants (`bb-v8qa-*`, `ac-v8-qa-*`) | Testing deployment only |

Alternate legacy QA orgs (`activeclinic-production-qa-e7e6a6`, `blessboard-postfix-qa-45190c`) remain on production but are **secondary**; prefer the disposable pair above.

---

## 3. Persona matrix

### 3.1 BB admin

| Field | Value |
| --- | --- |
| Email | `prod.qa.bb.5e15ca@getproapp.org` |
| Org | `blessboard-disposable-qa-5e15ca` |
| Legacy roles | `church_hq_admin` + `branch_admin` (bound to `hq-campus-qa`) |
| Catalogue | none required for admin smoke |
| Sign-in | `https://blessboard.com/login` |
| Lands on | `/hq` |
| Expected capacity | HQ website edit/publish/restore, membership/admin HQ paths |
| Scope | Church-wide via HQ; also can open `/branch-admin` (dual legacy grant from registration) |

**Scope note:** Registration provisioned **both** HQ and branch legacy roles on one identity. Treat as the BB admin persona. Do not interpret dual grant as a customer defect during QA; file separately if product wants pure HQ-only.

### 3.2 BB restricted-role

| Field | Value |
| --- | --- |
| Email | `prod.qa.bb.editor.abcftf@getproapp.org` |
| Org | `blessboard-disposable-qa-5e15ca` |
| Legacy role (login baseline) | `branch_admin` @ `hq-campus-qa` |
| Catalogue role | `website_editor` · scope `branch` |
| Sign-in | `https://blessboard.com/login` |
| Lands on | `/branch-admin` |
| Expected capacity | Branch website edit / submit; **not** HQ-only admin |
| Forbidden examples | Church-wide HQ admin surfaces that require `church_hq_admin` only; catalogue-only login without legacy companion remains V8-003 policy |

**Why this role:** Matches existing model — catalogue `website_editor` alone cannot establish a BB session (`V8-003`); companion legacy `branch_admin` is the supported login baseline with narrower catalogue intent.

### 3.3 AC clinic admin

| Field | Value |
| --- | --- |
| Email | `prod.qa.ac.bd9d83@getproapp.org` |
| Org | `activeclinic-disposable-qa-bd9d83` |
| Roles | `activeclinic_organization_admin` (organisation) **and** `activeclinic_receptionist` (facility `hq`) |
| Sign-in | `https://activeclinic.org/login` |
| Lands on | `/app` |
| Expected capacity | Org admin shell, settings, website publish, patient list (via receptionist dual-role) |
| Facility | `hq` (primary) |

**Scope note:** Dual `organization_admin` + `receptionist` matches the known production QA workaround for `patient.create` (`V8-002` / `AC-ORG-ADMIN-NO-PATIENT-CREATE`). Do not remove receptionist without an alternate patient-create path.

### 3.4 AC restricted-role

| Field | Value |
| --- | --- |
| Email | `prod.qa.ac.editor.abcftf@getproapp.org` |
| Org | `activeclinic-disposable-qa-bd9d83` |
| Role | `activeclinic_website_editor` · scope `organisation` |
| Sign-in | `https://activeclinic.org/login` |
| Lands on | `/app` |
| Expected capacity | Website view/edit/submit only |
| Forbidden examples | `website.publish` / restore/rollback; clinical / billing / access admin writes |

### 3.5 AC patient / test (optional)

| Field | Value |
| --- | --- |
| Email | `prod.qa.ac.patient.abk76i@getproapp.org` |
| Org | `activeclinic-disposable-qa-bd9d83` |
| Kind | Active patient row + platform identity |
| Sign-in | `https://activeclinic.org/clinics/activeclinic-disposable-qa-bd9d83/patient/login` |
| Identifier field | `identifier` (email **or** national phone) |
| Lands on | `/clinics/activeclinic-disposable-qa-bd9d83/patient` |
| When needed | Patient portal / My Booking continuity only — not required for staff website editor QA |

---

## 4. Creation-path blockers (documented)

Safe **automated** disposable provisioning via testing tooling is **blocked** on production:

| Path | Blocker |
| --- | --- |
| `npm run blessboard:seed-qa-role-users` | Refuses `environment_code=production` |
| `npm run activeclinic:seed-qa-role-users` | Refuses production; locked to `activeclinic-demo` |
| `db/scripts/v8-disposable-qa-tenant-provision.js` | Testing / V8 QA only |
| Shared testing password docs (`1234567890`) | Testing/demo only — never production |

**Approved alternative used:** existing disposable production orgs created earlier via **public registration** on production hosts (`getproapp.org` QA emails), with credentials held in the operator vault. Restricted + patient passwords were rotated into that vault on 2026-09-26 (disposable QA identities only).

Creating additional production orgs requires explicit owner approval (registration still works; sprawl risk).

---

## 5. Pre-QA gate

```bash
curl -s https://blessboard.com/healthz
curl -s https://activeclinic.org/healthz
```

Require `ok:true`, `deploymentCode=moovex-platform-production`, `environment=production`, `schemaCompatible=true`. Record `gitSha` in the QA evidence pack.

---

## 6. Suggested smoke order

1. Healthz gate (§5).
2. BB admin → `/hq` → open website editor (non-destructive draft preferred).
3. BB restricted editor → `/branch-admin` → confirm HQ-only denial where expected.
4. AC admin → `/app` → settings / patients (no real clinical writes).
5. AC restricted editor → confirm publish/clinical denials.
6. AC patient (if portal in scope) → clinic patient login via `identifier`.
7. Confirm no customer org appears in session context.

---

## 7. Credential custody (no secrets here)

| Item | Location |
| --- | --- |
| Operator vault (mode `600`) | `~/Documents/DocumentsAkiv/Akiv/Dev/ops-backups/getpro-v7-production-qa-tenants/qa-tenants-combined-5e15ca.json` |
| Cleanup plan (IDs only) | same folder · `CLEANUP_PLAN_5e15ca_bd9d83.md` |
| Allowed in Git | Emails, org keys, role names, hosts (this file) |
| Forbidden in Git | Passwords, hashes, session cookies, DB URLs |

One distinct password per persona. Do not reuse vault passwords across roles. Rotate after shared QA days or suspected exposure.

---

## 8. Owner actions

| Priority | Action | Owner |
| --- | --- | --- |
| P0 | Keep vault file off Git / chat / tickets; share only via password manager | Ops / QA lead |
| P0 | Use **only** the disposable org keys in §2 for production functional QA | All QA |
| P1 | Prefer non-destructive edits; restore website versions if a disposable site is left dirty | QA |
| P1 | Decide whether to demote BB admin dual `branch_admin` / AC admin dual `receptionist` after `V8-002` / `V8-003` policy closes | Product |
| P2 | Archive or suspend older mislabeled QA orgs (`data_environment=testing` on production DB) per cleanup plan | Ops |
| P2 | Do **not** execute disposable cleanup until remaining production QA media/write work is complete | Ops |
| P3 | If a new disposable tenant is required, create via public registration with `prod.qa.*@getproapp.org` and extend the vault — do not invent seeders for production | Ops |

---

## 9. Return token

```
V2_01_PROD_QA_ACCOUNTS = READY
```

Personas, roles, scopes, and owner actions are recorded above. Production product code was not modified.
