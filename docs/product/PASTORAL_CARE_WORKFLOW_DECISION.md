# Pastoral care workflow — product decision

**Date:** 2026-07-19  
**Branch:** `V5`  
**Mode:** Decision only — **no application code changed**  
**Sources:** [`FOUNDATION_GROWTH_BACKEND_PRIORITY.md`](./FOUNDATION_GROWTH_BACKEND_PRIORITY.md) · [`PRAYER_REQUEST_FEATURE_DECISION.md`](./PRAYER_REQUEST_FEATURE_DECISION.md) · fixed `user_roles.role_key` · `member_requests` / forms / appointments backlog · catalogue `care.automation`

---

## Retain / consideration gate

| Check | Result |
|-------|--------|
| Pastoral-care workflows (beyond requests) | **DEFERRED** — Growth catalogue; BB-14; marketing-only today |
| Dedicated prayer table | **REMOVE FROM SCOPE** (category in requests preferred) |
| Leader / pastoral role | **Forbidden** — do not invent |
| Safe role + privacy model approved? | **No** |

In scope for this document: **consideration only** (deferred backlog). Not approved for implementation.

---

## Options (reuse vs new)

| Option | Meaning | Fit |
|--------|---------|-----|
| **1. Requests** | Extend `member_requests` categories / statuses | **Best default care surface today** — already has ownership, status history, BA/HQ queues |
| **2. Prayer requests** | Dedicated prayer product | **Rejected as separate schema** ([prayer decision](./PRAYER_REQUEST_FEATURE_DECISION.md)); prayer = `category = 'prayer'` |
| **3. Appointments** | Booking slots | **DEFERRED** (BB-12); not a confidential case engine |
| **4. Forms** | Allowlisted schema submissions | **Wrong domain** for care cases (no care status machine / confidentiality) |
| **5. Dedicated confidential case module** | New case tables, assignees, sealed notes | **Catalogue aspiration** (`care.automation`); needs roles + privacy ADR before any DDL |

**Recommendation if ever elevated:** stay on **(1) requests** for ordinary care; do **not** build **(5)** until confidentiality, assignee model, and HQ redaction are signed. Do **not** invent pastoral roles to unlock Stitch copy.

---

## Decision matrix (required topics)

### 1. Case ownership
- Today: requesting **member** owns the request; branch/HQ **review** via admin roles.
- Dedicated cases would need assignee (who?) — **no pastoral role** exists. Assignee would have to be `branch_admin` / `church_hq_admin` only unless Network invents roles (out of Foundation/Growth).

### 2. Confidentiality
- Requests today: full `message` visible to BA on branch and **HQ church-wide** (prayer decision flags this as a privacy gap).
- True pastoral confidentiality needs redaction rules, sealed notes, and export bans — **unsigned**.

### 3. Authorized roles
- Allowed: `member`, `branch_admin`, `church_hq_admin`, `platform_admin`.
- **Not allowed:** leader / counselor / pastoral custom roles without Network/product SoT change.

### 4. Branch / HQ visibility
- BA: branch-scoped queue (operational).
- HQ: church-wide oversight today — **must not** silently widen sensitive care bodies.
- Unsigned: HQ subject/status-only vs full text (same open question as prayer **D2**).

### 5. Member visibility
- Member sees own requests/history.
- Member must **not** see other members’ care cases.
- No public/anonymous care intake without identity design (out of V5).

### 6. Notes
- Safe limited review notes exist on requests.
- Internal pastoral notes (hidden from member) = **new privacy class** — not approved.

### 7. Status / history
- Requests already have status + `member_request_status_history`.
- Case workflows (intake → assigned → closed → escalate) need product statuses — **not defined**.

### 8. Retention
- No signed care retention / purge policy distinct from general requests.
- Sensitive care may need shorter retention or legal hold — **unsigned**.

### 9. Audit logging
- Platform audit exists for important writes; care-specific audit of “who viewed sealed note” is **not** implemented and would be required for (5).

### 10. Notifications
- No V5 care notification / SMS / email SLA channel (scheduled communications **DEFERRED** / MISSING_BACKEND).
- Do not promise pastoral response timing.

### 11. Export restrictions
- HQ reports should stay **aggregates** (counts), never dump care bodies.
- Any CSV/export of care cases needs an explicit deny-by-default policy — **unsigned**.

### 12. Stitch screens
- No dedicated pastoral-case Stitch pair mapped as READY in V5 screen map for a confidential case engine.
- Prayer / requests Stitch pairs exist; appointments / advanced care chrome are catalogue or deferred.
- Do not invent screens that imply leader portals (leader portal **REMOVE FROM SCOPE**).

### 13. Foundation / Growth scope
| Package | Ordinary requests (incl. prayer category) | Advanced pastoral case engine |
|---------|---------------------------------------------|--------------------------------|
| Foundation | **In scope** (existing) | **Out** |
| Growth | Same | Catalogue `care.automation` — **DEFERRED**, not sold honesty today |
| Network | Inherits | Custom roles / assisted only if SoT says so |

### 14. Schema impact
- Prefer **zero** new tables: use `member_requests`.
- Dedicated case module = new blessboard tables + migrations — **do not** run against hosted until approved; only if product elevates BB-14 and signs privacy.

### 15. Risks

| Risk | Level | Mitigation |
|------|-------|------------|
| HQ over-exposure of sensitive text | **High** | Decide visibility before any CTA that increases volume |
| Inventing pastoral/leader roles | **High** | Forbidden; BA/HQ only |
| Parallel care stacks (forms + requests + cases) | High | Single SoT: requests until case ADR |
| Promising confidentiality without controls | High | Do not market sealed care until redaction + audit exist |
| Notifications / SLA theatre | Medium | Omit until delivery exists |
| Scope creep into appointments/calendar | Medium | Keep BB-12 separate |

---

## Default

**DEFER** pastoral-care workflows beyond existing requests unless product approves:

1. Role model (BA/HQ only vs Network custom), and  
2. Privacy model (HQ redaction, member-hidden notes, export bans, retention).

Until then, Foundation/Growth honesty is already served by **member requests** (and prayer-as-category pending D1/D2).

---

## Conclusion

| Outcome | Selected |
|---------|----------|
| READY TO IMPLEMENT | **No** |
| PRODUCT DECISION REQUIRED | **Yes** — if product wants anything beyond current requests (visibility, sealed notes, case engine) |
| **DEFER** | **Yes** — default for BB-14 / advanced pastoral workflows |

**Verdict: DEFER** (with open product decisions if ever elevating beyond requests)

Not READY TO IMPLEMENT. Continue using **requests** (and prayer category per prayer decision). Do not schedule a confidential case module, forms-based care, or appointment-as-care without a signed privacy/role ADR.

---

## Suggested commit (docs only)

```text
Document pastoral care workflow decision: defer advanced cases; keep requests.
```
