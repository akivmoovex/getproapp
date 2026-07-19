# Network — screen and feature coverage audit

**Date:** 2026-07-19  
**Branch:** `V5` @ `fa36fea` (+ Network entitlement reconciliation)  
**Mode:** Coverage + entitlement matrix companions  
**Scope:** Approved **Network** package (`plan_key` runtime `professional`, display **Network**) plus Growth inheritance  
**Sources:** [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md) · [`COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md`](./COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md) · [`FOUNDATION_FINAL_READINESS.md`](../release/FOUNDATION_FINAL_READINESS.md) · [`GROWTH_FINAL_READINESS.md`](../release/GROWTH_FINAL_READINESS.md) · [`FOUNDATION_GROWTH_ENTITLEMENT_RECONCILIATION.md`](./FOUNDATION_GROWTH_ENTITLEMENT_RECONCILIATION.md) · [`NETWORK_ENTITLEMENT_MATRIX.md`](./NETWORK_ENTITLEMENT_MATRIX.md) · [`STITCH_SCREEN_MAP.md`](../gui/STITCH_SCREEN_MAP.md) · `blessBoardPackageCatalogue.js` · `003_blessboard_plans.sql` · `entitlementService` · `platform.domains` · V5 routes through blessboard/`025` + platform/`013`

**Companions:** [`NETWORK_IMPLEMENTATION_QUEUE.md`](../gui/NETWORK_IMPLEMENTATION_QUEUE.md) · [`NETWORK_BLOCKED_FEATURES.md`](./NETWORK_BLOCKED_FEATURES.md) · [`NETWORK_ENTITLEMENT_MATRIX.md`](./NETWORK_ENTITLEMENT_MATRIX.md)

**Rules applied:** Pricing SoT over decorative Stitch; “by arrangement” / assisted ≠ self-serve; catalogue aspirational flags ≠ runtime V5 entitlements; no invented mailbox/API providers; Growth deferred catalogue rows stay deferred on Network.

---

## Status legend

| Status | Meaning |
|--------|---------|
| **COMPLETE** | Capability works for Network (or honestly inherits Growth); route/service/authz/tests present |
| **PARTIAL** | Usable ops or inherited surface; material Network differentiator gaps remain |
| **MISSING_GUI** | Backend/ops path exists; no adequate self-serve or HQ UI |
| **MISSING_BACKEND** | Product intent / catalogue / Stitch signal; V5 schema/service/route incomplete |
| **REQUIRES_EXTERNAL_SERVICE** | Needs approved third-party provider or ops protocol before software can complete |
| **PRODUCT_DECISION_REQUIRED** | Scope, ownership, or self-serve vs assisted not signed |
| **DEFERRED** | Catalogue/marketing aspiration; not Network V5 product until elevated |
| **NOT_SOFTWARE_FEATURE** | Ops / SLA / commercial promise — not a shippable product route |

---

## Runtime entitlement SoT (Network)

| Layer | Network reality |
|-------|-----------------|
| Display name | **Network** |
| Persisted `plan_key` | `professional` (alias `partner` legacy inactive; package catalogue maps → `network`) |
| Capacity | `max_branches` / `max_users` / `max_staff_accounts` = unlimited (NULL) |
| Reports | `basic_reports` + `advanced_reports` = **true** (inherits Growth) |
| Active Network-only gate | `custom_domain` = **true** (assisted registry / provision assert) |
| Reserved Network-only (inactive until backend) | `custom_email`, `advanced_roles`, `report_templates`, `api_access`, `webhooks`, `integrations` = **false**; `max_mailboxes_per_branch` = **0** |
| Active Network gates | `custom_domain`, `executive_reports`, `advanced_audit` = **true** on Network |
| Platform Admin assign | Active plans include `professional` via `listActivePlans` (PA org detail select). Pricing still frames Network as **assisted / ops** — not self-serve checkout |
| Church V4 assign path | `ASSIGNABLE_PACKAGE_CODES` = `foundation` / `growth` only — Network excluded there (intentional) |
| Commercial catalogue extras | Nested package-catalogue paths (e.g. `email.mailboxes_per_branch=5`) remain marketing — **not** FEATURE_KEYS=true |

Detail matrix: [`NETWORK_ENTITLEMENT_MATRIX.md`](./NETWORK_ENTITLEMENT_MATRIX.md).

`FEATURE_KEYS` runtime set: capacity limits (`max_branches`, `max_users`, `max_staff_accounts`, `max_mailboxes_per_branch`), reports (`basic_reports`, `advanced_reports`), Network gates (`custom_domain`, `custom_email`, `advanced_roles`, `executive_reports`, `report_templates`, `api_access`, `webhooks`, `integrations`, `advanced_audit`).

---

## Verification dimensions (per feature)

For each row below, audit checked:

1. Stitch desktop · 2. Stitch mobile · 3. Route · 4. Template · 5. Schema · 6. Service · 7. Authorization · 8. Entitlement · 9. Tests · 10. External dependency · 11. Operational ownership

---

## Master coverage table

| Order | Feature | Stitch IDs | Route | Backend | Entitlement | External dependency | Status | Blocker |
|------:|---------|------------|-------|---------|-------------|----------------------|--------|---------|
| 1 | Growth inheritance (all Foundation + Growth retained surfaces) | See FG coverage / map | `/` … `/hq/*`, `/branch-admin/*`, `/member/*` | OK — shared V5 | Unlimited + `advanced_reports` on `professional` | None | **COMPLETE** | Demo personas/CMS still B02–B04 (ops) |
| 2 | Unlimited active branches | — | CLI / service create-branch | OK — `assertCanCreateBranch` | `max_branches` NULL | None | **COMPLETE** | HQ create-branch GUI intentionally absent |
| 3 | Cross-branch HQ administration | HQ shell / content / modules | `/hq/*`, `/b/:branchKey` | OK | Church-scoped HQ authz | None | **COMPLETE** | — |
| 4 | Advanced attendance & giving detail | D `2a577dc1…` · M `06489c79…` | `/hq/reports/attendance`, `/hq/reports/giving` | OK | `advanced_reports` | None | **COMPLETE** | Same Growth gate; Network inherits |
| 5 | HQ reports hub (basic + entitled detail links) | same consolidated pair | `/hq/reports` | OK | `basic_reports` + advanced when entitled | None | **COMPLETE** | — |
| 6 | HQ fixed-role assign/revoke | D `12f5be53…` · M `de3e82ef…` | `/hq/roles` | OK — fixed three roles | Soft seats unlimited | None | **PARTIAL** | **Not** Network advanced/custom matrix — see order 10 |
| 7 | HQ audit trail (append-only church events) | D `bce1e8ec…` · M `d7fcb1b3…` (+ review queue pair) | `/hq/audit` | OK — `platform.audit_events` | HQ role | None | **PARTIAL** | Advanced governance / retention / compliance packs absent |
| 8 | Custom organization domain (assisted) | Adapted settings D `30e38567…` · M `efb0fd24…` | `/admin/domains`, `/admin/domains/:hostname`; provision CLI custom type | **PARTIAL** — `platform.domains` + `assertFeature(custom_domain)` on provision insert | `custom_domain` **true** | DNS / registrar / TLS (manual today) | **PARTIAL** | Self-serve DNS/SSL automation **excluded**; tenant HQ domain UI **MISSING_GUI**; PA create-custom POST limited |
| 9 | Hosted mailboxes (≤5 / active branch) | — (no dedicated Stitch pair) | Catalogue paths `/branch/email/hosted` (gated hidden; no V5 mount) | **NONE** — no mailbox tables / provider adapter | `custom_email` **false**; `max_mailboxes_per_branch` **0** (catalogue still lists 5) | Mail hosting provider | **REQUIRES_EXTERNAL_SERVICE** | Provider + schema + product model unsigned |
| 10 | Advanced org-wide roles & permissions | Roles pair above (Stitch also shows leader tier — **not** V5) | `/hq/roles` only | Fixed `role_key` CHECK only | `advanced_roles` **false**; soft seats unlimited | None for fixed; advanced = product | **PRODUCT_DECISION_REQUIRED** | Pricing: assisted / by arrangement; no custom-role schema |
| 11 | Executive dashboards & consolidated analytics | Consolidated analytics pair (order 4–5) | `/hq/reports*`, `/hq/reports/executive` | Growth aggregates + Network executive snapshot | `advanced_reports` (live); `executive_reports` **true** on Network | None for approved aggregates | **PARTIAL** | NW-EX-01 shipped; trends/exports/hierarchy still blocked |
| 12 | Custom report templates | Org templates D `df111bee…` · M `801584ed…` | — | **NONE** | `report_templates` **false** | None | **MISSING_BACKEND** | No template applicator; pricing “by arrangement” |
| 13 | API access | — | Catalogue `/hq/integrations/api` (no V5 route) | **NONE** | `api_access` **false** | API gateway / auth protocol | **REQUIRES_EXTERNAL_SERVICE** | Protocol + product decision required |
| 14 | Webhooks | — | Catalogue `/hq/integrations/webhooks` (no V5 route) | **NONE** | `webhooks` **false** | Delivery infrastructure | **REQUIRES_EXTERNAL_SERVICE** | Protocol decision required |
| 15 | External integrations | — | — | **NONE** | `integrations` **false** | Per-integration vendors | **REQUIRES_EXTERNAL_SERVICE** | By arrangement — no generic integration bus |
| 16 | Advanced audit & governance controls | Audit pairs (order 7) | `/hq/audit`, `/hq/audit/governance` | Basic trail OK; Network governance filters | HQ authz; `advanced_audit` **true** on Network | None for presentation | **PARTIAL** | NW-GOV-01 shipped; exports / retention / compliance packs still out |
| 17 | Assisted implementation & priority support | Support monitoring D `74cbe4a0…` · M `9f400420…` (reused for deployment detail in map) | No Network support portal | N/A | Catalogue `network.priority_support` / `support.level=priority` | Support tooling / CRM | **NOT_SOFTWARE_FEATURE** | Ops/SLA promise; Stitch 68 ≠ customer support product |
| 18 | Optional managed services | — | — | N/A | — | Ops contracts | **NOT_SOFTWARE_FEATURE** | Explicitly out of software queue |
| 19 | Network package catalogue / pricing honesty | Pricing D `1c50e898…` · M `181ec1f8…`; FAQ pair | `/pricing`, `/features`, `/for-churches` | OK — content modules | Display SoT | None | **COMPLETE** | Checkout still absent (intentional) |
| 20 | Platform Admin plans / subscriptions / entitlements | Plans D `4d0f59ac…` · M `b5953809…` | `/admin/plans`, `/admin/subscriptions`, org detail | OK | Shows Network FEATURE_KEYS incl. inactive gates | None | **PARTIAL** | Network activation still commercially “assisted”; plan_key vocabulary `professional` |
| 21 | Media library / storage | Shared UI States / Batch 22 | Media admin routes | OK — blessboard media | Storage catalogue aspirational | Object storage (Supabase adapter exists for blobs) | **COMPLETE** (Growth/Foundation shared) | Not a Network differentiator |
| 22 | Payment / checkout for Network | — | — | **NONE** (intentional) | Billing catalogue cents only | Payment provider | **DEFERRED** | Out of Network software audit; pricing SoT non-goal |
| 23 | Plan-key rename `professional` → `network` | — | — | Analysis only | Display remap today | Migration window | **PRODUCT_DECISION_REQUIRED** | Release blocker B12 — not Network GUI |

---

## Dimension detail (Network differentiators)

### Custom organization domain

| # | Check | Result |
|---|--------|--------|
| 1–2 | Stitch D/M | No dedicated domain Stitch; PA uses settings pair `30e38567…` / `efb0fd24…` |
| 3–4 | Route / template | `/admin/domains`, `/admin/domains/:hostname` + EJS; provision CLI |
| 5 | Schema | `platform.domains` (`domain_type` includes `custom`) |
| 6 | Service | `provisionPlatformTenant` fail-closed `assertFeature(custom_domain)` for BlessBoard custom inserts; list/detail services |
| 7 | Authz | `platform_admin` for PA; provision ops |
| 8 | Entitlement | `custom_domain` true on `professional` / `partner` |
| 9 | Tests | `platform-entitlements` (deny without entitlement; Network allow extra campuses); PA shell domain tests |
| 10 | External | DNS / certificates / registrar — **manual assisted** |
| 11 | Ops owner | Platform ops / assisted onboarding |

### Hosted mailboxes

| # | Check | Result |
|---|--------|--------|
| 1–2 | Stitch | **None** |
| 3–4 | Route / template | Catalogue-only paths; **no** V5 mount |
| 5–6 | Schema / service | **Missing** |
| 7–8 | Authz / entitlement | `custom_email` **false**; `max_mailboxes_per_branch` **0** until provider |
| 9 | Tests | Catalogue unit tests for capacity `5`; PA shows “Hosted mailboxes” usage label |
| 10 | External | **Mailbox hosting provider required** |
| 11 | Ops owner | Unassigned until provider approved |

### API / webhooks / integrations

| # | Check | Result |
|---|--------|--------|
| 1–4 | Stitch / routes / templates | **None** live |
| 5–6 | Schema / service | **None** (tests assert HQ webhook POST → 409 locked) |
| 8 | Entitlement | Catalogue nested flags only; runtime `api_access` / `webhooks` / `integrations` = **false** |
| 10 | External | Protocol + gateway + secrets management |
| 11 | Ops owner | By arrangement |

### Advanced roles

| # | Check | Result |
|---|--------|--------|
| 1–2 | Stitch | Permission pair exists; decorative Ministry Leader tier **not** implemented |
| 3–6 | Route / schema | `/hq/roles` + `blessboard.user_roles` fixed CHECK |
| 8 | Entitlement | No Network-only role-matrix flag in FEATURE_KEYS |
| 11 | Ops owner | Assisted custom roles = product + schema program |

---

## Summary counts

| Status | Count (master rows) |
|--------|--------------------:|
| COMPLETE | 8 |
| PARTIAL | 6 |
| MISSING_BACKEND | 1 |
| REQUIRES_EXTERNAL_SERVICE | 4 |
| PRODUCT_DECISION_REQUIRED | 2 |
| NOT_SOFTWARE_FEATURE | 2 |
| DEFERRED | 1 |

*(Some rows span multiple classes; primary status shown in master table.)*

---

## What Network may honestly claim today

- Everything **Foundation + Growth** already ships (multi-branch HQ, advanced attendance/giving reports, fixed HQ/branch admin assign).
- **Custom organization domain** as **assisted** ops: entitlement-gated registry in `platform.domains` + PA directory/detail; **not** self-service DNS/SSL.
- **Hosted mailbox capacity** and **API / webhooks / integrations / executive exports / advanced roles** only as **by arrangement / assisted** commercial language — runtime FEATURE_KEYS for those remain **false** / mailbox limit **0** until backends exist.
- **Priority support / managed services** as commercial/ops promises — not product screens.

---

## Stop

Network coverage audit complete. Implementation batches: [`NETWORK_IMPLEMENTATION_QUEUE.md`](../gui/NETWORK_IMPLEMENTATION_QUEUE.md). Blockers: [`NETWORK_BLOCKED_FEATURES.md`](./NETWORK_BLOCKED_FEATURES.md).
