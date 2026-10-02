# V2.01 — V8-002 / V8-003 Policy Decision Pack

**Task:** `V2_01_V8_002_V8_003_POLICY_REVIEW`  
**Date:** 2026-09-26  
**Branch:** `V8` tip `f1c2b5656307`  
**Mode:** **Policy review only — no implementation**  
**Production:** **READ-ONLY** · `03a89106e2fe` · `moovex-platform-production` **untouched**

**Sources:**  
`docs/releases/V8_BACKLOG.md` · `docs/qa/V2_01_MASTER_BACKLOG_AUDIT.md` · `docs/qa/V2_01_OVERNIGHT_BACKLOG_SUMMARY.md` · AC/BB backlog closures · `V2_01_SHARED_SECURITY_IDENTITY_QA.md` · `docs/security/V8_SHARED_RBAC_TENANT_ISOLATION.md` · migration `088_activeclinic_rbac_role_catalogue.sql` · `establishBlessBoardSession.js` / `listActiveRolesForUser` · RBAC matrix tests

---

## Verdict

**`READY_FOR_OWNER_DECISION`**

Both items are fully specified enough for an owner go/no-go. Requirements are not missing; **product policy** is. Do **not** implement either change until the decision tables below are signed.

| ID | Product | Severity | Blocker type |
| --- | --- | --- | --- |
| **V8-002** | ActiveClinic | P3 | Permission-matrix policy |
| **V8-003** | BlessBoard | P3 | Login-eligibility / session policy |

---

# V8-002 — ActiveClinic `org_admin` ± `patient.create`

## Original requirement

From `docs/releases/V8_BACKLOG.md`:

> The ActiveClinic `org_admin` role does not automatically have `patient.create` permission.  
> A production QA test required assigning `activeclinic_receptionist` to create a synthetic patient.  
> Decide whether `org_admin` should inherit `patient.create` or require an additional operational role.  
> **Do not** automatically grant `patient.create` before the product policy is approved.

Master audit action: *Decide org_admin ± `patient.create`; implement approved matrix.*

## Product(s) affected

| Surface | Impact |
| --- | --- |
| **ActiveClinic** authenticated ops | Patient registration UI/API (`activeclinic.patient.create`) |
| BlessBoard | **None** (AC catalogue only) |
| Public booking / patient portal | Indirect only if staff registration paths change |

Canonical role key: `activeclinic_organization_admin` (aka org_admin).

## Current behavior (evidence)

| Fact | Evidence |
| --- | --- |
| Org admin **does not** receive `activeclinic.patient.create` | Migration `088` org-admin permission array: view/search/archive/audit — **no** create/update |
| RBAC matrix expects org_admin **without** create; receptionist / medical records **with** create | `tests/activeclinic-rbac-role-matrix.test.js` `MUST_HAVE` |
| Registration routes require `activeclinic.patient.create` at facility scope | `ACTIVECLINIC_PATIENT_REGISTRATION.md` · `activeClinicPatientService.js` |
| Dashboard “register patient” capability gated on that permission | `activeClinicDashboardCapabilities.js` |
| Workaround used in QA | Assign `activeclinic_receptionist` (or staff with create) |

**Intent of current matrix (088 description):** org admin = *tenant-owner administration: organization, facilities, staff, access, audit. **No clinical or finance write by default.***

## Why it remains open

Not a bug vs the shipped least-privilege matrix — it is an **unresolved product preference**: should a clinic owner/admin be able to register patients without also holding an operational role?

Security identity QA correctly classified this as **OUT_OF_SCOPE / policy**, not P0 identity integrity.

## Security / data implications

| If grant create to org_admin | If keep status quo |
| --- | --- |
| Broader PHI write surface for a sensitive role | Least privilege preserved; owners cannot create patients alone |
| Registration + duplicate-override paths become available if those grants are bundled carelessly | Clear separation: admin vs front-desk |
| Audit still required (`activeclinic.patient.create`) | Receivers/receptionists remain accountable for registration |
| Risk of “god mode” creep if create is bundled with merge/identifiers/clinical writes | Multi-role assignment is the intentional pattern |

**Hard constraints regardless of choice:** tenant isolation, facility scope checks, duplicate detection, no silent merge grant, audit on create.

## UX implications

| Grant create | Keep separate |
| --- | --- |
| Org admins can use Patients → New without a second role | Org admins see registration CTAs disabled / redirected unless dual-roled |
| Simpler for small clinics (owner = receptionist) | Matches “admin configures; staff operates” |
| May surprise auditors expecting clinical separation | Friction for solo-operator clinics |

## Options

| Option | Summary |
| --- | --- |
| **A — Keep least privilege (status quo)** | Org admin **never** gets `patient.create` by default. Dual-role (receptionist / medical records) required for registration. Document as intentional. |
| **B — Grant `patient.create` (+ minimal companions) to org_admin** | Add `patient.create` (and decide separately on `patient.update` / `duplicate_override` / identifiers). Still **no** clinical/finance write. Document revised matrix + migrate catalogue. |
| **C — Conditional / scoped grant** | Org admin gets create only when clinic has **no** receptionist assigned, or only at HQ facility, or via explicit toggle — higher complexity; needs extra rules. |

## Recommended default implementation path

**Recommend Option A** unless owner explicitly wants owner-operators to register patients without dual roles.

Rationale: matches migration 088 design language, existing matrix tests, and overnight/security guidance (“do not auto-grant”). If product wants B, treat as a deliberate matrix change with migration + QA — not a “bugfix.”

If owner chooses **B**, recommended minimal grant set:

- Add: `activeclinic.patient.create`
- Explicitly decide: `patient.update`, `duplicate_override`, `manage_identifiers`, `view_sensitive_contact` (default recommend **not** auto-adding merge/archive beyond current archive already present)
- Do **not** add clinical/finance writes

## Migration requirement

| Choice | Migration? |
| --- | --- |
| **A** | **No** code/migration — docs-only closure (`FIXED_BY_POLICY` / `WONT_CHANGE`) |
| **B** | **Yes** — additive SQL to attach permission keys to `activeclinic_organization_admin` (and network_admin mirror if still mirrored); update RBAC matrix tests |
| **C** | Likely code + possibly schema flags — highest cost |

## Backward compatibility

| Choice | Compatibility |
| --- | --- |
| **A** | Full — current prod/testing behavior unchanged |
| **B** | Additive grants — existing receptionist paths unchanged; org_admin gains ability |
| **C** | Behavior depends on rules; needs careful rollout |

## Acceptance criteria (after owner picks)

**Shared (any option):**

1. Written permission matrix checked into docs (AC role catalogue).  
2. UI capability flags match API authorization.  
3. Tenant isolation + `patient.create` audit still pass.  
4. Receptionist / clinician / finance matrices unchanged unless explicitly listed.  
5. Hosted V8 QA: org_admin attempt create allowed/denied per decision; dual-role still works.

**If A:** org_admin alone → **403**/capability hide on create; with receptionist → **PASS**.  
**If B:** org_admin alone → create **PASS**; still cannot dispense/consult/refund.

## What requires owner approval

- Choose **A / B / C**.  
- If **B**: exact permission key list beyond `patient.create`.  
- Whether network_admin mirror must match org_admin.  
- Whether this is a **go-live blocker** for V8 production promotion (overnight summary: decide before claiming readiness).

---

# V8-003 — BlessBoard catalogue-only role login

## Original requirement

From `docs/releases/V8_BACKLOG.md`:

> Users assigned only catalogue roles such as `website_editor` or `website_publisher` cannot establish a login session.  
> Login returns `no_active_role` unless an appropriate legacy role is also assigned.  
> Allow valid active catalogue-only organization memberships to establish sessions.  
> Preserve legacy compatibility; enforce exact catalogue permissions; do not grant broad legacy admin automatically.  
> Verify editor cannot publish; publisher only where authorized; reject suspended / cross-tenant.  
> **Unresolved:** Confirm catalogue-only roles are login-eligible without companion legacy `user_roles` (product policy).

## Product(s) affected

| Surface | Impact |
| --- | --- |
| **BlessBoard** auth / session | Login email/phone + session establishment |
| Website editor / publish | After login, catalogue permissions already evaluated by RBAC service |
| ActiveClinic | **None** for this ID (AC has separate staff login eligibility) |

## Current behavior (evidence)

| Fact | Evidence |
| --- | --- |
| Session establishment loads **legacy** `blessboard.user_roles` only | `listActiveRolesForUser` → `FROM blessboard.user_roles WHERE status = 'active'` |
| No active legacy role (+ no member scope) → `no_active_role` | `establishBlessBoardSession.js` |
| Catalogue RBAC assignments authorize **actions** after session exists | `blessBoardRbacAuthorizationService.js` (catalogue + legacy compat; BB-BUG-001: catalogue authoritative for publish keys) |
| Pure `website_editor` / `website_publisher` catalogue assignment **without** legacy row → **cannot log in** | `V8_BACKLOG.md` current behavior |

So: catalogue roles are permission carriers today; **login eligibility is still legacy-role-centric**.

## Why it remains open

Requires an explicit product decision to treat website catalogue roles as **first-class login principals**. Implementing without that decision risks:

- Accidental privilege expansion via legacy fallthrough (BB-BUG-001 history)  
- Weakening “no_active_role” as a safety net  
- Ambiguous sessions for users with catalogue roles across many orgs

Security QA: **do not weaken auth to “fix”**; remains policy-gated P3.

## Security / data implications

| Allow catalogue-only login | Keep legacy companion required |
| --- | --- |
| Website staff can work without HQ/branch admin legacy roles | Forces dual assignment (legacy + catalogue) — operational friction |
| Must bind session org/church/branch from **catalogue assignment scope**, not client | Clear legacy gate for who may obtain a session |
| Must preserve BB-BUG-001: editor must **not** inherit publish via legacy union | Session creation unchanged |
| Suspended catalogue assignment / membership must deny | Suspended legacy already denies |
| Cross-tenant: only orgs with active assignment | Same |

## UX implications

| Allow catalogue-only login | Keep companion |
| --- | --- |
| HQ can invite website_editor and they sign in immediately | Invite fails until admin also grants church_hq_admin / branch_admin / other legacy |
| Clearer “website roles” product story | Confusing: “you have website_editor but cannot log in” |
| Need post-login landing that is not HQ admin shell if they lack admin | Companion roles may dump users into wrong shells |

## Options

| Option | Summary |
| --- | --- |
| **A — Keep companion legacy required (status quo)** | Catalogue roles alone never login-eligible. Document: assign a minimal legacy role (define which) **or** use member + catalogue. Close as intentional. |
| **B — Catalogue-only login for website roles (recommended if enabling)** | Active `website_editor` / `website_publisher` (and optionally AC website catalogue twins if any) **may** establish sessions scoped to assignment org/church/branch. No auto legacy admin. Exact catalogue permissions only. |
| **C — Hybrid allowlist** | Only specific catalogue roles login-eligible (e.g. publisher+editor yes; other catalogue roles no). Or require org membership row **plus** catalogue assignment. |

## Recommended default implementation path

**Recommend Option B** *if product wants website staff as first-class users*; otherwise **Option A** as explicit WONT_CHANGE.

Default recommendation for V8 product direction: **Option B** with tight constraints:

1. Login-eligible catalogue roles (initial allowlist): `website_editor`, `website_publisher` only.  
2. Session scope from **active catalogue assignment** (org/church/branch) — never client-supplied IDs.  
3. Authorization remains catalogue-authoritative for publish keys (BB-BUG-001).  
4. `website_editor` → edit/draft only; no publish.  
5. `website_publisher` → publish only where catalogue grants.  
6. Suspended assignment / suspended user / cross-tenant → deny.  
7. Do **not** auto-insert legacy `user_roles`.  
8. Preserve existing legacy login paths unchanged.

If owner prefers minimal risk for a near-term production cutover: choose **A** now and schedule **B** as a named auth epic.

## Migration requirement

| Choice | Migration? |
| --- | --- |
| **A** | **No** — docs + QA fixture guidance only |
| **B / C** | **Likely code** in `establishBlessBoardSession` / auth repository to union catalogue assignments into login eligibility; **possible** no SQL if assignments already in RBAC tables; verify schema for assignment status/scope. Fixture/seed updates for QA users. |

## Backward compatibility

| Choice | Compatibility |
| --- | --- |
| **A** | Full |
| **B** | Additive eligibility — existing legacy users unchanged; newly eligible catalogue-only users can log in |
| **C** | Additive for allowlisted roles only |

## Acceptance criteria (after owner picks)

**If A:** Document companion requirement; hosted attempt with catalogue-only → still `no_active_role`; dual legacy+catalogue → PASS.

**If B/C:**

1. Email + phone login for catalogue-only allowlisted roles → session created.  
2. Editor: can open website editor; **cannot** publish.  
3. Publisher: can publish only with catalogue grant; no HQ admin powers.  
4. Suspended / wrong-tenant → denied.  
5. Direct API authz matches UI.  
6. No automatic legacy admin role inserted.  
7. Regression: existing HQ/branch/platform_admin login unchanged.  
8. Hosted V8 QA evidence attached.

## What requires owner approval

- Choose **A / B / C**.  
- If **B/C**: exact allowlist of catalogue `role_key`s.  
- Post-login default landing (public editor vs HQ).  
- Whether branch-scoped website roles may log in without HQ legacy.  
- Go-live blocker? (overnight: decide before production readiness claims)

---

# Cross-cutting notes

| Topic | Guidance |
| --- | --- |
| Severity | Both **P3** — not overnight P0; not identity integrity bugs |
| Implementation ban | This review **forbids** code/SQL until owner signs below |
| Related | V8-001 (email) is separate ops; do not bundle |
| Production | No deploy / migrate from this task |

---

# Owner decision capture (fill in)

## V8-002

| Field | Owner entry |
| --- | --- |
| Chosen option | A / B / C |
| If B: permission keys | |
| Network_admin mirror? | Yes / No |
| Go-live blocker? | Yes / No |
| Approver / date | |

## V8-003

| Field | Owner entry |
| --- | --- |
| Chosen option | A / B / C |
| If B/C: role allowlist | |
| Default landing | |
| Go-live blocker? | Yes / No |
| Approver / date | |

---

## FINAL VERDICT (repeat)

**`READY_FOR_OWNER_DECISION`**

V8-002 and V8-003 are documented with current behavior, options, recommended defaults (**002 → A**; **003 → B if website staff are first-class, else A**), migration/compatibility, acceptance criteria, and approval fields. **No implementation performed.** Production untouched.
