# Prayer request feature decision (BlessBoard V5)

**Date:** 2026-07-19  
**Branch:** `V5`  
**Mode:** Product / architecture decision only — **no application code changed**  
**Companions:** [`FOUNDATION_GROWTH_BLOCKED_SCREENS.md`](../gui/FOUNDATION_GROWTH_BLOCKED_SCREENS.md) · [`FOUNDATION_GROWTH_SCREEN_COVERAGE.md`](./FOUNDATION_GROWTH_SCREEN_COVERAGE.md) · [`FOUNDATION_GROWTH_BACKEND_SCREEN_PLAN.md`](./FOUNDATION_GROWTH_BACKEND_SCREEN_PLAN.md) · [`STITCH_SCREEN_MAP.md`](../gui/STITCH_SCREEN_MAP.md) · [`BATCH_10C_MEMBER_REQUESTS.md`](../gui/BATCH_10C_MEMBER_REQUESTS.md) · [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md)

**Hard constraints honored in this recommendation:**

- Do not invent pastoral / leader roles (V5 has only `member`, `branch_admin`, `church_hq_admin`, `platform_admin`).
- Do not expose prayer **message text** broadly to HQ by default (requires a visibility decision before GUI work that widens HQ surface).
- Do not implement in this task.

---

## Verdict

### **PRODUCT DECISION REQUIRED**

Recommended technical model if product accepts it: **Option B** — treat prayer as the existing `member_requests.category = 'prayer'` path (already live). Do **not** invent a prayer table or forms-based prayer workflow.

Implementation of FG-Q07 (dashboard CTA) and any Stitch-23 chrome must wait on the exact blocking decisions in §14.

---

## 1. Options considered

| Option | Description | Fit today |
|--------|-------------|-----------|
| **A. Dedicated feature + route** | New `/member/prayer-request` with its own table/service | Stitch title suggests this; **no** V5 table; risks duplicate care stack and invented pastoral roles |
| **B. Predefined category in requests** | Use `blessboard.member_requests` with `category IN (…, 'prayer', …)` | **Already implemented** (schema + member + BA/HQ admin) |
| **C. Predefined form in forms module** | Publish a CMS form labeled “Prayer” | Wrong domain: forms are allowlisted schema submissions, not care workflow with statuses/history |
| **D. Defer** | Keep dashboard prayer tile disabled; leave Requests as the only entry | Safe; Stitch 23 stays MISSING; category still usable via `/member/requests` |

### Rejected for V5 Foundation/Growth

- **C** — forms lack request status machine, category privacy semantics, and care review UX; would fabricate a parallel path.
- **A with new schema** — not required for commercial Foundation/Growth honesty; catalogue “advanced care” is **DEFERRED** (`care.automation`), not a prayer-table mandate.
- **A with invented leader/pastoral role** — forbidden by product/authz SoT.

### Acceptable variants of B

| Variant | Meaning |
|---------|---------|
| **B1 — Link only** | Enable dashboard CTA → `/member/requests/new?category=prayer` (no new route) |
| **B2 — Thin alias** | Optional `GET/POST /member/prayer-request` that **reuses** `formsRequestsService` / same table (presentation alias only) |
| **B3 — Hide CTA** | Keep tile `enabled: false`, `href: null`; prayer remains available under Requests nav |

---

## 2. Recommended model

**Recommend Option B (category in existing requests module), default variant B1 unless Stitch-23 chrome is funded as B2.**

Rationale:

1. Schema already allowlists `prayer` (`025_create_resources_forms_requests.sql`).
2. Member submit/status and BA/HQ review already ship (`BATCH_10C`, `BATCH_15D`).
3. Pricing SoT does not list a separate prayer SKU; care is Foundation-level member ops.
4. Dedicated table/route without new privacy rules would **widen** HQ exposure of sensitive text (see §7).
5. Forms module (C) is the wrong abstraction.

**Not recommended:** building Stitch 23 as an independent product with confidential/urgent/SLA/notifications until those are explicitly approved (today they are intentional omissions on the requests surface).

---

## 3. Route design

### Current (live)

| Actor | Routes |
|-------|--------|
| Member | `GET/POST /member/requests`, `GET /member/requests/new`, `GET /member/requests/:id` (+ optional private file) |
| Branch admin | `/branch-admin/requests*` |
| HQ | `/hq/requests`, `/hq/requests/b/:branchKey*` |
| Dedicated prayer | **None** — dashboard module `prayer` is `enabled: false`, `href: null` |

### Recommended after product decision

| Decision | Routes |
|----------|--------|
| **B1** | No new routes. CTA → `/member/requests/new?category=prayer`. Prefill category radio (already defaults toward prayer on new form). |
| **B2** | Thin alias only: `GET/POST /member/prayer-request` → same service as requests; 303 to `/member/requests/:id`. **No** second table. |
| **B3** | No CTA change; document Requests as the prayer entry. |
| **A (dedicated schema)** | **Do not** without a separate care-program ADR. |

Public / anonymous prayer URL: **out of scope** (member_id required; no anon schema).

---

## 4. Schema impact

| Path | Impact |
|------|--------|
| **B1 / B3** | **None** |
| **B2 thin alias** | **None** (routes only) |
| Confidential / urgent flags | Would need nullable columns or history metadata — **only if product unlocks** (currently omitted on purpose) |
| Anonymous submissions | Would need nullable `member_id` + public auth model — **not recommended**; invents identity |
| Retention TTL | No purge columns today; retention is ops/policy, not schema-required for B |
| Dedicated prayer table | **Avoid** |

---

## 5. Service impact

| Path | Impact |
|------|--------|
| **B1 / B3** | Dashboard/nav wiring only (`memberPortalRoutes` quick actions / `memberPortalNav`) |
| **B2** | Thin controller wrapping `createMemberRequest` / presenters; reuse CSRF + member gate |
| Privacy tightening (recommended with B) | Optional service/presenter rules: for `category=prayer`, HQ list/detail may show **subject + status only** unless branch-scoped; full `message` for branch admin (and member owner) — **product must confirm** |
| Notifications | None today beyond in-app status history; do not invent email/SMS |
| Audit | Status changes already record `entityType: "member_request"`; keep that — no second audit channel |

---

## 6. Authorization matrix

Existing roles only — **no leader / pastoral role**.

| Action | Member (owner) | Branch admin (branch scope) | HQ admin | Platform admin |
|--------|----------------|-----------------------------|----------|----------------|
| Submit prayer (as category) | Yes (authenticated member) | No (not member submit) | No | Ops only via other tools |
| List own prayer requests | Yes | — | — | — |
| Read own message | Yes | — | — | — |
| List branch requests (incl. prayer) | — | Yes (assigned branch) | Yes (church-wide or branch-scoped) | Yes |
| Read full prayer **message** | Yes (own) | Yes (branch) today | **Yes today church-wide** — **conflicts with “not broadly to HQ by default”** | Same as HQ |
| Update status / staff notes | — | Yes | Yes | Yes |
| Member-visible history | Filtered (`member_visible`) | Full history for admins | Full | Full |

**Anonymous:** not supported.  
**Leader portal:** NOT_IN_SCOPE (no role).

---

## 7. Privacy model

### Current behavior

- Member copy promises pastoral confidentiality (UI hint).
- Attachments must be **private** media when present.
- Staff notes can be `memberVisible: false`.
- **HQ church-wide queue currently receives full `message` text** for all categories including prayer.

### Required privacy stance for recommendation B

| Rule | Recommendation |
|------|----------------|
| Owner | Full subject + message + member-visible history |
| Branch admin | Full text for requests on **their** branch (operational care) |
| HQ admin (default) | **Do not** show prayer **message** in church-wide list/detail by default — subject, category, status, branch, timestamps only; optional “open in branch context” |
| HQ branch-scoped `/hq/requests/b/:key` | Same as branch admin for that branch (if product treats HQ-as-branch-admin) — **confirm** |
| Exports / reports | HQ reports already use **counts** of open requests — keep aggregates only; never dump prayer bodies into reports |
| Public site | No prayer widget / form |

Until HQ visibility is decided, **do not** market a “dedicated prayer experience” that increases HQ browsing of prayer text.

---

## 8. Stitch screens

| Stitch | IDs | Map status | Relation to V5 |
|--------|-----|------------|----------------|
| Member submit prayer | D `57edf489…` · M `1dd180a3…` (23-*) | MISSING route `/member/prayer-request` | Reference chrome for B1/B2; **do not** require separate schema |
| Member submit online request | D `2cfd58a5…` · M `196260ba…` (21-*) | Live `/member/requests/new` | Canonical submit (includes Prayer category card) |
| Member request status | D `530cb58f…` · M `6c5f8b31…` (22-*) | Live `/member/requests*` | Status tracking |
| Member dashboard | D `4207a5a6…` · M `b315a9d1…` | Live; prayer quick-action disabled | FG-Q07 target |

**Parity posture:** CLOSE on requests (21–22) with intentional omissions (confidential checkbox, SLA, upload dropzone, crisis chat — `BATCH_10C` §7). Stitch 23 is a **presentation** gap, not a missing care backend.

---

## 9. Foundation / Growth entitlement

| Package | Prayer-as-category | Dedicated prayer product | Notes |
|---------|--------------------|--------------------------|-------|
| **Foundation** | **In scope** (member requests already all-packages) | Not required | No plan feature key for prayer |
| **Growth** | Same as Foundation | Not required | Catalogue `care.automation: advanced` is **DEFERRED** — not prayer CTA |
| **Network** | Inherits | N/A | No Network-only prayer |

No `platform.plan_features` gate needed for B1/B2/B3.

---

## 10. Tests required (after a decision)

| Decision | Tests |
|----------|-------|
| **B1** | Dashboard CTA enabled + href; GET new with `category=prayer` selects prayer; submit creates `category=prayer`; CSRF; ownership |
| **B2** | Alias GET/POST; no second table; redirect to `/member/requests/:id`; same authz as requests |
| **B3** | Tile remains disabled; no dead href; requests path still works |
| Privacy (if approved) | HQ church-wide list/detail **omit** prayer message body; branch admin still sees message; member sees own |
| Negatives | No anon POST; no leader role; forms module not used for prayer |

Existing: `tests/blessboard-forms-requests.test.js` covers core request privacy/CSRF/categories.

---

## 11. Migration impact

| Source | Impact |
|--------|--------|
| V4→V5 | No dedicated prayer entity required for B; map legacy care/prayer rows into `member_requests` with `category=prayer` **only if** a mapping already exists or is later approved |
| New schema | None for B1–B3 |
| Data retention | Ops policy; no auto-purge in V5 |

---

## 12. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| HQ over-exposure of prayer text | **High** | Decide visibility before enabling CTA that drives volume; default HQ redaction for `prayer` |
| Inventing pastoral roles for Stitch “leadership” copy | High | Keep BA/HQ only; copy must say branch/HQ reviewers |
| Building A (new table) duplicates B | Medium | Reject unless confidential workflow ADR |
| Using forms (C) for care | Medium | Reject |
| Stitch 23 MATCHED claim without side-by-side | Low | Prefer B1; B2 only for chrome; MATCHED not claimed lightly |
| Notifications / SLA expectations from Stitch | Medium | Keep omissions; no email/SMS without product |

---

## 13. Implementation batch order

1. **Product signs §14 decisions** (blocking).
2. **FG-Q07 batch** — dashboard CTA per B1/B2/B3 only (no schema).
3. **Optional privacy batch** — HQ prayer message redaction (if approved) before or with FG-Q07 if CTA increases volume.
4. **Optional B2 chrome** — thin `/member/prayer-request` alias + Stitch-23 presentation polish (still no table).
5. **Do not** schedule confidential flags, anon prayer, leader portal, or advanced care automation with this work.

---

## 14. Exact blocking decisions (owner must answer)

| # | Decision | Options | Default if owner silent |
|---|----------|---------|-------------------------|
| **D1** | Dashboard prayer CTA | **Link (B1)** · **Thin alias (B2)** · **Keep disabled (B3)** | Keep **B3** (current honest disabled tile) |
| **D2** | HQ visibility of prayer **message** body | **Redact church-wide (recommended)** · **Full access as today** · **Branch-scoped HQ only** | Treat as **must decide before B1/B2**; do not silently ship B1 while HQ still sees full text church-wide |
| **D3** | Confidential / urgent controls | **Omit (current)** · **Add later with schema** | **Omit** |
| **D4** | Anonymous / public prayer | **Not in V5** · (would invent identity) | **Not in V5** |
| **D5** | Stitch 23 | **Reference only (B1)** · **Fund B2 alias chrome** · **Leave MISSING** | Reference only |

---

## 15. Assessment summary (requested dimensions)

| Dimension | Current V5 | Under recommended B |
|-----------|------------|---------------------|
| Privacy | Member + BA/HQ see message; private attachments | Keep member/BA; **tighten HQ default** per D2 |
| Visibility | Requests nav live; dashboard prayer disabled | Per D1 |
| Branch vs HQ | BA branch-scoped; HQ church-wide | Same roles; HQ body redaction optional |
| Anonymous vs authenticated | Authenticated member only | Unchanged |
| Confidential requests | Not in schema (Stitch omitted) | Omit unless D3 unlocks |
| Status tracking | `submitted` → `in_review` → `resolved`/`closed` + history | Unchanged |
| Leader/pastoral access | **No leader role** | BA/HQ only |
| Retention | No automated purge | Policy-only |
| Notifications | No email/SMS guarantees | Unchanged |
| Audit logging | Status changes → `member_request` audit | Unchanged |
| Stitch parity | 21–22 CLOSE; 23 MISSING | 23 via B1/B2 presentation or stay MISSING |
| Foundation vs Growth | All packages | All packages; no entitlement key |

---

## 16. Conclusion line

**PRODUCT DECISION REQUIRED** — recommended model **B** (prayer category in existing requests); **not READY TO IMPLEMENT** until **D1** and **D2** are signed; **not DEFER** as a whole (backend already exists), but CTA/chrome may remain deferred under **B3**.

Suggested documentation commit message:

```text
Document prayer request feature decision: prefer requests category over dedicated route.
```
