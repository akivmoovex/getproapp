# Network advanced organization roles decision (BlessBoard V5)

**Date:** 2026-07-19  
**Branch:** `V5`  
**Mode:** Product / architecture decision only — **do not implement arbitrary permissions**  
**Constraint:** Do not create role names without approved responsibilities  

**Companions:** [`NETWORK_BLOCKED_FEATURES.md`](./NETWORK_BLOCKED_FEATURES.md) (B7 / N3) · [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](./NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) · [`NETWORK_ENTITLEMENT_MATRIX.md`](./NETWORK_ENTITLEMENT_MATRIX.md) · [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md) · [`BATCH_FG_HQ_ROLE_MANAGEMENT.md`](../gui/BATCH_FG_HQ_ROLE_MANAGEMENT.md) · [`PASTORAL_CARE_WORKFLOW_DECISION.md`](./PASTORAL_CARE_WORKFLOW_DECISION.md)

---

## Verdict

### **DEFER**

Network does **not** require a shippable advanced-role product in V5 until product approves **named** fixed responsibilities (if any). Keep commercial language as **assisted / by arrangement**; keep runtime `advanced_roles = false`.

| Conclude label | Selected |
|----------------|:--------:|
| READY FOR FIXED ROLE BUNDLES | No — no approved additional role responsibilities to encode |
| READY FOR CUSTOM ROLES | No — no permission catalogue / grant architecture |
| PRODUCT DECISION REQUIRED | Companion only (N3 remains open if Network later wants extra fixed keys) |
| **DEFER** | **Yes (primary)** |

**Safest implementation model:** Continue the **fixed three-role** model already shipped (`platform_admin` · `church_hq_admin` · `branch_admin`). Treat Stitch “Ministry Leader” and View/Edit/Delete toggles as **decorative**. Do **not** build tenant-editable permission matrices. Any future expansion = **option A only**, after product names roles and scopes — never invent keys in a batch.

---

## 1. Existing role model (V5 BlessBoard)

| `role_key` | Scope (DB constraints) | Who assigns | Surfaces |
|------------|------------------------|-------------|----------|
| `platform_admin` | Organization only (`church_id` / `branch_id` NULL) | Ops / CLI — **not** HQ UI | Platform admin |
| `church_hq_admin` | Church (`church_id` set, `branch_id` NULL) | HQ / PA via `/hq/roles` + CLI | HQ shell |
| `branch_admin` | Branch (`church_id` + `branch_id`) | HQ / PA via `/hq/roles` + CLI | Branch admin shell |

Source: `db/migrations/blessboard/005_create_user_roles.sql` CHECK + ownership trigger; `hqRoleManagementService` (BB-02); `authorizeBlessBoardTenantAccess` + `createRequireBlessBoardTenantRole({ allowedRoles })`.

**Not in V5 BlessBoard RBAC:**

- Arbitrary permission grants / capability catalogue  
- Tenant-defined custom roles  
- Department-scoped roles (no departments schema/routes in V5 blessboard)  
- Ministry / pastoral / counselor roles in `blessboard.user_roles`

**Legacy church (V4 / public schema):** `church_ministry_leaders` and leader sessions exist outside V5 BlessBoard auth. Pastoral-care decision already forbids inventing leader/counselor roles without Network SoT. Do **not** treat V4 leaders as Network advanced roles.

**GetPro directory admin roles** (`src/auth/roles.js` / `docs/roles-and-permissions.md`) are a **different product** (tenant CRM/directory). Not a template to copy into BlessBoard without a dedicated design.

---

## 2. Department / leader roles

| Layer | Status |
|-------|--------|
| V5 departments | **Missing** (Stitch map MISSING; no blessboard department tables) |
| V5 ministry leader role_key | **Absent** from CHECK |
| Stitch HQ roles screen | Shows **Ministry Leader** tier + permission toggles |
| Shipped `/hq/roles` | Explicitly **omits** Ministry Leader and fake toggles ([BB-02](../gui/BATCH_FG_HQ_ROLE_MANAGEMENT.md)) |

Department-scoped authorization is **out of scope** until departments + approved role SoT exist.

---

## 3. Network coverage and entitlement

| Item | Finding |
|------|---------|
| Pricing | Network: “Fair use + advanced roles (assisted / by arrangement)” |
| `FEATURE_KEYS.advanced_roles` | **false** on all plans (reserved) |
| Coverage row | Advanced org roles = **PRODUCT_DECISION_REQUIRED** |
| Blocked B7 | Custom role matrix needs schema beyond fixed three |
| Fixed-role HQ UI | Already **COMPLETE** for Growth/Network inheritance — **not** gated by `advanced_roles` |

Raising `advanced_roles` without a defined matrix would advertise a false product. Fixed-role assign must stay available without that flag.

---

## 4. Stitch advanced-role screens

| Viewport | ID | Title |
|----------|-----|-------|
| Desktop | `12f5be535eeb49f1a1c5822ae7586504` | `59-hq-permission-role-management-desktop` |
| Mobile | `de3e82ef3ad54065a516b042459fdc19` | `59-hq-permission-role-management-mobile` |

Observed design (not V5 SoT for behavior):

- Role hierarchy cards including **Ministry Leader**  
- Per-staff **View / Edit / Delete** toggles for domains such as Financial Ledger, Member Directory, Compliance Audits  

**Interpretation:** Visual exploration of a permission matrix — **not** backed by any BlessBoard permission catalogue. Matching toggles would invent arbitrary permissions (forbidden by this prompt).

---

## 5. Authorization matrix (what exists today)

| Mechanism | Behavior |
|-----------|----------|
| Role grants | Rows in `blessboard.user_roles` with enforced org/church/branch ownership |
| Effective roles | Loaded from DB on authorize (not a frozen permission set in the cookie) |
| Route gates | `allowedRoles` allowlists on middleware (coarse: HQ vs branch vs PA) |
| Feature gates | Entitlements (`hasFeature`) — orthogonal to staff roles |
| Seat limits | Soft `max_staff_accounts` on assign |
| Self-escalation | HQ assign/revoke **forbids** self-assign/self-revoke |
| `platform_admin` via HQ | **Forbidden** |
| Cross-church | **Forbidden** |
| Audit | `role.assigned` / `role.revoked` |

There is **no** fine-grained permission catalogue (e.g. `giving.write`, `members.delete`) for BlessBoard V5. Capabilities are implied by **which shell/routes** the role may enter.

---

## 6. Options compared

### A. Additional fixed scoped roles

| | |
|--|--|
| **Idea** | Add CHECK-constrained `role_key` values with fixed scopes (e.g. future content-only or report-reviewer) |
| **Pros** | Same architecture as today; auditable; fail-closed; low support burden vs custom |
| **Cons** | **No approved names/responsibilities** — cannot invent in this decision |
| **Fit** | Future only after product SoT names roles + route matrix |

### B. Permission bundles based on existing roles

| | |
|--|--|
| **Idea** | Document/code-map that HQ / branch / PA are the bundles; optional internal “capability lists” derived from role_key only (not tenant-editable) |
| **Pros** | Clarifies docs/tests; no schema change |
| **Cons** | Does not deliver Stitch matrix or Network “advanced roles” marketing as software |
| **Fit** | Documentation hygiene only — not a Network feature ship |

### C. Fully custom roles

| | |
|--|--|
| **Idea** | Tenant creates roles + toggles permissions (Stitch-like) |
| **Pros** | Matches decorative Stitch |
| **Cons** | Needs catalogue, grant tables, UI, escalation/SOD rules, migration of every route gate, support nightmare; **no architecture exists** |
| **Fit** | **Reject** for V5 Network |

### D. Deferred role customization

| | |
|--|--|
| **Idea** | Keep fixed three; `advanced_roles` false; assisted commercial language; Stitch extras non-binding |
| **Pros** | Matches runtime honesty; preserves BB-02; lowest risk |
| **Cons** | Network marketing remains “by arrangement” not self-serve |
| **Fit** | **Recommended now** |

---

## 7. Assessment matrix

| Topic | Assessment |
|-------|------------|
| **Permission catalogue** | **None** for BlessBoard. Only role_key + route allowlists. Custom roles unsafe. |
| **Role scope** | Fixed by CHECK (org / church / branch). Adequate for current surfaces. |
| **Church scope** | HQ admin church-wide; enforced in authz + HQ services. |
| **Branch scope** | Branch admin branch-only; HQ may assign per branch. |
| **Department scope** | **N/A** — no V5 departments. |
| **Self-escalation** | Mitigated for fixed roles (no self assign/revoke; no PA via HQ). Custom matrices would reopen this. |
| **Separation of duties** | Coarse only (PA ≠ HQ ≠ BA). No SoD engine (e.g. assigner ≠ approver). Enough for three roles; insufficient for arbitrary perms. |
| **Auditability** | Assign/revoke audited. Fine-grained “who toggled giving.delete” does not apply today. |
| **Stale sessions after permission change** | Authz **re-reads** active roles from DB per request path — revoke is enforceable without waiting for cookie expiry (covered in HQ roles tests). Session identity can remain; **effective** access drops. Custom grants would need the same live-read pattern everywhere. |
| **Migration impact** | Custom roles: CHECK change + new tables + every middleware. Fixed add-on roles: CHECK + assign allowlist + route matrix — smaller but still product-gated. |
| **Administrative complexity** | Fixed three: low (shipped). Custom: high for churches and GetPro support. |
| **Support burden** | Assisted custom roles as **ops promise** is manageable; self-serve matrix is not, without catalogue + runbooks. |

---

## 8. Does Network require A / B / C / D?

| Option | Required for Network V5? |
|--------|---------------------------|
| A Additional fixed roles | **Not yet** — no approved responsibilities |
| B Bundles on existing roles | Already the live model; optional docs only |
| C Fully custom roles | **No** |
| D Defer customization | **Yes** |

---

## 9. Recommendation

1. **DEFER** Network advanced / custom role software.  
2. **Do not** raise `FEATURE_KEYS.advanced_roles`.  
3. **Do not** implement Stitch permission toggles or Ministry Leader without a signed role SoT.  
4. **Keep** `/hq/roles` fixed-role assign/revoke as the Network-honest staff UI.  
5. If product later needs more than three roles: reopen as **PRODUCT DECISION REQUIRED** to approve **named** fixed roles + scopes + route matrix → then **READY FOR FIXED ROLE BUNDLES** (option A). Never jump to C.  
6. Optional low-risk hygiene (not a Network unlock): document an internal “implied capabilities by role_key” matrix for engineers — still not tenant-editable (option B docs).

---

## 10. Required product decisions (if un-deferred later)

| # | Decision | Blocks |
|---|----------|--------|
| R1 | Exact additional `role_key` names and one-line responsibilities | Any new CHECK values |
| R2 | Scope per key (org / church / branch / future department) | Schema constraints |
| R3 | Who may assign each key (HQ vs PA only) | HQ service allowlists |
| R4 | Whether Network-only via `advanced_roles` or available on Growth | Entitlement seed |
| R5 | Seat accounting for new keys vs `max_staff_accounts` | Soft limits |
| R6 | Whether Ministry Leader is ever a BlessBoard role or stays V4-only | Stitch parity vs SoT |

Until R1–R3 are signed, batches must not invent role names.

---

## 11. Safe next batch

| Batch | Scope | Stop |
|-------|--------|------|
| **None for advanced roles** | — | No schema, no toggles, no new role_keys |
| Optional | Apex / pricing honesty: keep “advanced roles · assisted / by arrangement”; never “custom permission matrix available” | No FEATURE_KEYS=true |

---

## 12. Conclude

| Label | Result |
|-------|--------|
| READY FOR FIXED ROLE BUNDLES | Not until R1–R3 |
| READY FOR CUSTOM ROLES | Never under current architecture |
| PRODUCT DECISION REQUIRED | Only if Network insists on roles beyond the fixed three |
| **DEFER** | **Selected** |

**Safest model:** Fixed role bundles **as already implemented** (three keys); defer all customization and Stitch matrix chrome.

---

## Stop

Decision recorded. No arbitrary permissions, role names, or entitlement activation implemented.
