# Platform create-organization GUI decision (BlessBoard V5)

**Date:** 2026-07-19  
**Branch:** `V5`  
**Mode:** Product / operations decision only — **no application code changed**  
**Companions:** [`FOUNDATION_GROWTH_BLOCKED_SCREENS.md`](../gui/FOUNDATION_GROWTH_BLOCKED_SCREENS.md) · [`FOUNDATION_GROWTH_SCREEN_COVERAGE.md`](./FOUNDATION_GROWTH_SCREEN_COVERAGE.md) · [`PLATFORM_ADMIN_PARITY_AUDIT.md`](../gui/PLATFORM_ADMIN_PARITY_AUDIT.md) · [`STITCH_SCREEN_MAP.md`](../gui/STITCH_SCREEN_MAP.md) · [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md) · [`V5_RELEASE_BLOCKERS.md`](../release/V5_RELEASE_BLOCKERS.md)

**Decision rule applied:** Prefer **CLI-only** unless a GUI has a clear operational need **and** can reuse **one atomic** provisioning service end-to-end.

---

## Verdict

### **KEEP CLI-ONLY**

Retain Platform Admin create-organization as **CLI-only** for demo and production cutover. Do **not** implement `/admin/organizations/new` now.

**IMPLEMENT LATER** is acceptable only as a post-cutover backlog item **after** an atomic orchestrator exists — not as a cutover dependency.

**IMPLEMENT SIMPLE GUI** is **not** recommended for this release: there is no single atomic “org + church + HQ + admin user” service to wrap safely.

---

## 1. Options considered

| Option | Description | Fit today |
|--------|-------------|-----------|
| **A. Retain CLI-only** | Ops runs `platform:tenant:provision` → `blessboard:church:provision` → `blessboard:user:create` → `blessboard:user:role:assign` (+ optional plan assign) | **Current production posture**; PA UI documents CLI-only |
| **B. Simple reviewable GUI** | PA form POSTs into existing provision service(s) | Would either cover **only** `provisionPlatformTenant` (incomplete vs Stitch “create church org”) or invent a new multi-call orchestrator |
| **C. Multi-step onboarding workflow** | Wizard: org → domain → church → admin → package → welcome | High cost; overlaps apex `/register-church` **enquiry** + assisted Network onboarding; invents credential delivery UX |

### Why B fails the decision rule

Provisioning is **already split** into separate transactional services/CLIs:

| Step | Service / CLI | Creates |
|------|---------------|---------|
| 1 | `provisionPlatformTenant` / `npm run platform:tenant:provision` | Organization, BlessBoard enrolment, domain; default `free` subscription |
| 2 | `provisionBlessBoardChurch` / `npm run blessboard:church:provision` | Church + HQ branch |
| 3 | `createBlessBoardUser` / `npm run blessboard:user:create` | User (password via stdin) |
| 4 | `assignBlessBoardRole` / `npm run blessboard:user:role:assign` | HQ/branch role |
| 5 (optional) | `assignOrganizationPlan` (PA UI already) | Growth (etc.) after org exists |

There is **no** one atomic API that performs steps 1–4. A “simple GUI that calls the existing provisioning service” either:

- provisions **catalogue only** (org/domain) and leaves church/admin to CLI — poor Stitch parity and incomplete ops; or  
- invents a new orchestrator — which is **not** “reuse one atomic service.”

### Why C fails for cutover

Multi-step onboarding is a product program (credentials, email, DNS verification, Network assisted path). Pricing SoT already routes public interest to **contact-led** `/register-church` enquiry — not self-serve provision. Network custom domain remains assisted.

---

## 2. Assessment matrix

| Concern | CLI-only (A) today | Simple GUI (B) if forced | Multi-step (C) |
|---------|--------------------|--------------------------|----------------|
| **Duplicate organization prevention** | Key uniqueness + conflict statuses in `provisionPlatformTenant` | Same if reused; must not invent parallel insert paths | Same + wizard state risk |
| **Domain ownership** | Hostname uniqueness; custom domain gated by `custom_domain` entitlement | GUI mistakes more likely (wrong host typed under PA session) | Needs DNS verify story (not built) |
| **Church and branch creation** | Separate `provisionBlessBoardChurch` (HQ branch) | Not in tenant provisioner — GUI must call second service or stay incomplete | Wizard step |
| **Initial admin user** | Separate create + role assign; password via `--password-stdin` | Browser would handle secrets — high risk | Needs invite/temp password product |
| **Temporary credential handling** | Ops stdin; CLI never prints secrets by design | Temp password in HTML/session/logs is a **security anti-pattern** | Email invite not implemented |
| **Package assignment** | Default `free` on tenant provision; Growth via existing PA plan UI | Must not invent checkout | Same |
| **Deployment / environment** | Explicit `--deployment`, `--environment` + `DATABASE_IDENTITY_EXPECTED` | GUI must constrain to active deployment; easy to mis-set `testing` vs `production` | Same |
| **Transaction boundaries** | Each CLI is its own transaction; ops sequences deliberately | Partial success (org without church/admin) needs compensating UX | Orchestrator TX or saga required |
| **Rollback** | Manual ops reverse / re-run find-or-create; no auto-delete | Incomplete GUI leaves orphan org/domain | Complex |
| **Audit logging** | Platform ops via DB + existing PA mutations (plan/override) | Would need explicit audit on create POST | Same |
| **Stitch parity** | Stitch 64 (`d992150d…` / `0da4f454…`) stays MISSING — documented intentional | Would unlock FG-Q06 presentation only if orchestrator exists | Highest chrome cost |
| **Security risk** | Lowest attack surface; apex + `platform_admin` already for list/detail/plan | CSRF + PA session becomes provision weapon; credential display | Highest |
| **Token / implementation cost** | **0** for GUI | Medium–high (orchestrator + form + tests + credential policy) | Very high |

---

## 3. Current Platform Admin surface (evidence)

| Route | Behavior |
|-------|----------|
| `GET /admin/organizations` | List/search; copy states provisioning is CLI-only |
| `GET /admin/organizations/:organizationKey` | Detail + plan/override mutations (CSRF) |
| `GET /admin/organizations/new` | **Absent** — no handler in `platformAdminRoutes.js` |
| Dashboard | Explicit note: organization creation not available |

Authz: apex host + `platform_admin` (existing). No create POST to protect.

Release note: [`V5_RELEASE_BLOCKERS.md`](../release/V5_RELEASE_BLOCKERS.md) **A03** — Create Organization CLI-only = **LOW** demo severity; use CLI for demo orgs.

---

## 4. Demo impact

| Need | CLI-only impact |
|------|-----------------|
| Show PA org list / plan assign / entitlements | **None** — already demo-ready |
| Show Stitch create-org screen | Skipped; documented MISSING / BLOCKED BY PRODUCT |
| Provision a disposable demo tenant | Ops runs existing npm scripts (fixture path used by tests) |

**Demo cutover does not require create-org GUI.**

---

## 5. Production impact

| Need | CLI-only impact |
|------|-----------------|
| Public self-serve church signup | Already **not** offered — `/register-church` is enquiry |
| Assisted / Network onboarding | Ops CLI + PA plan UI after provision — aligns with pricing SoT |
| High-volume PA self-serve provision | Not a stated V5 requirement |

**Production cutover does not require create-org GUI.** Contact-led + CLI remains the honest model.

---

## 6. Required service reuse (if GUI ever unlocked later)

Do **not** add a second insert path. Prerequisites for any future **IMPLEMENT SIMPLE GUI**:

1. **New** (or explicit) orchestrator wrapping, in one transaction or documented saga:
   - `provisionPlatformTenant`
   - `provisionBlessBoardChurch`
   - `createBlessBoardUser` + `assignBlessBoardRole`
2. Credential policy that does **not** render passwords in HTML (one-time set-password link or out-of-band ops delivery).
3. Apex-only + `platform_admin` + CSRF + deployment identity checks.
4. Audit event on successful provision.
5. Honest empty states if church step fails after org exists (or full rollback).

Until (1)–(2) exist, FG-Q06 stays **product-blocked**.

---

## 7. Security risks of implementing GUI now

| Risk | Severity | Notes |
|------|----------|-------|
| Temp password in browser response / history | **High** | CLI uses stdin specifically to avoid this |
| PA session as bulk provision + domain claim tool | High | Mistyped hostname / environment |
| Partial provision orphans | Medium | Org without church or admin |
| Duplicate / race creates | Medium | Mitigated in services, but GUI retries amplify |
| Expanding Stitch wizard beyond entitlements | Medium | Custom domain / billing chrome not entitled |

CLI-only keeps secrets and multi-step ops in controlled operator environment with `DATABASE_IDENTITY_EXPECTED`.

---

## 8. Recommendation summary

| Question | Answer |
|----------|--------|
| Needed before demo? | **No** |
| Needed before production cutover? | **No** |
| Clear operational need for GUI now? | **No** — volume is assisted/ops; enquiry covers inbound interest |
| One atomic provision service to wrap? | **No** |
| Conclusion | **KEEP CLI-ONLY** |

Optional future label: **IMPLEMENT LATER** (post-cutover), contingent on orchestrator + credential policy — not scheduled in Foundation/Growth executable GUI queue.

---

## 9. Suggested documentation commit message

```text
Document platform create-organization GUI decision: keep CLI-only for cutover.
```
