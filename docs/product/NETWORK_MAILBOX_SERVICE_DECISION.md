# Network mailbox service decision (BlessBoard V5)

**Date:** 2026-07-19  
**Branch:** `V5`  
**Mode:** Product / architecture decision only — **no mailbox hosting implemented**  
**Constraint:** Do not browse or select a provider · Do not invent APIs · Do not store mailbox passwords · Do not implement email hosting  

**Companions:** [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md) · [`NETWORK_ENTITLEMENT_MATRIX.md`](./NETWORK_ENTITLEMENT_MATRIX.md) · [`NETWORK_BLOCKED_FEATURES.md`](./NETWORK_BLOCKED_FEATURES.md) · [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](./NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) · [`COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md`](./COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md)

**Approved commercial claim (SoT):** Network may include **up to 5 mailboxes per active branch**.

---

## Verdict

### **REMOVE OR DEFER CLAIM**

Defer **live / included hosted-mailbox** product claims until an external mailbox provider is approved **outside** this prompt. Keep capacity **5 per active branch** only as a **future Network allowance** (catalogue / SoT), not as a shippable V5 feature.

| Companion conclusion | Role |
|----------------------|------|
| **EXTERNAL PROVIDER REQUIRED** | Any real mailbox create/login/MX delivery — **always** outside BlessBoard process |
| **IMPLEMENT MANUAL REQUEST WORKFLOW** | **Not now** — no fulfillment path without a provider; would invent an empty ticket product |

Runtime already matches deferral: `custom_email = false`, `max_mailboxes_per_branch = 0` on all plans ([entitlement matrix](./NETWORK_ENTITLEMENT_MATRIX.md)). Public pricing / package catalogue still advertise capacity **5** — that is the honesty gap this decision closes at the product layer.

---

## 1. What BlessBoard itself may own vs external provider

| Concern | BlessBoard (allowed later) | External mailbox provider (required for real mail) |
|---------|----------------------------|-----------------------------------------------------|
| Commercial allowance (≤5 / active branch) | Catalogue + FEATURE_KEYS when activated | — |
| Entitlement / seat counting | Count active branches × allowance; fail-closed writes | — |
| Request / ticket for assisted ops | Optional CRM-style request record | — |
| Audit of requests / status changes | `platform.audit_events` | Provider admin logs |
| MX / mailbox store / IMAP / SMTP auth | **Never** | **Always** |
| Password issue / reset / recovery | **Never store passwords** | Provider identity / recovery |
| Domain verification for email | May *display* DNS instructions (custom domain Model A) | Provider domain verify |
| Spam, quarantine, storage | — | Provider |
| Billing of mailbox SKUs beyond Network list | Ops quote | Provider invoice and/or BlessBoard commercial (product) |

**Not the same product:** V4/V5 “external email” / broadcast quota (`external_emails` in `blessBoardPackageCatalogue`) is **outbound message allowance**, not hosted mailboxes. Do not conflate.

**Not the same product:** `blessboard.contact_channels` is published CMS contact info, not mailbox accounts.

---

## 2. Assessment (repository evidence)

| Topic | Finding |
|-------|---------|
| **Mailbox provider options already configured** | **None.** No hosting adapter, no IMAP/SMTP mailbox provision client, no vendor SDK for mailbox CRUD in V5 platform/blessboard. Outbound mail helpers (if any elsewhere) ≠ mailbox hosting. |
| **Domain verification dependency** | Custom org domain is Network-assisted and itself **BACKEND CHANGES REQUIRED** ([custom domain readiness](./NETWORK_CUSTOM_DOMAIN_READINESS.md)). Hosted mailboxes on a church domain typically need verified custom domain + MX — **blocked on domain workflow + provider**. |
| **Mailbox provisioning API availability** | **None in repo.** Catalogue feature paths (`/branch/email/hosted`) are locked/hidden; no V5 mount. |
| **Password and recovery** | No BlessBoard mailbox credential store. **Hard rule:** never store mailbox passwords in BlessBoard. |
| **User ownership** | No mailbox↔user or mailbox↔branch schema. `blessboard.users.email` is login identity, not a hosted mailbox. |
| **Branch allowance calculation** | Commercial: `NETWORK_MAILBOXES_PER_BRANCH = 5`. Runtime limit key `max_mailboxes_per_branch` = **0** (inactive). Active-branch definition already exists for billing capacity. |
| **Suspended / inactive branch** | No mailbox rows. Pricing: inactive branches not billable; allowance should bind to **active** branches only when enforced later. |
| **Downgrade behavior** | Pricing §5: Network → Growth/Foundation must revoke Network infrastructure (incl. mailboxes) — **manual process today**. No automate-able revoke without provider. |
| **Mailbox deletion** | No product surface. Provider-side only if provisioned manually. |
| **Forwarding aliases** | Not in V5 schema/product. |
| **Security and privacy** | Hosting mailboxes would expand PII/message surface; without provider controls and legal posture, unsafe to pretend. |
| **Audit logging** | No mailbox audit events. Domain/PA audit gaps are separate. |
| **Support responsibility** | Today: commercial “assisted / by arrangement” — ops. No in-app support portal (NOT_SOFTWARE_FEATURE). |
| **Billing responsibility** | Network list price is per **active branch**; mailbox capacity is **included** in SoT wording, not a separate meter. Registrar/DNS fees separate. Provider costs must be decided before claiming “included hosting.” |

---

## 3. Options compared

### A. Informational entitlement and manual support workflow

| | |
|--|--|
| **Idea** | Show Network allowance; HQ/PA “request mailbox” creates an internal request; ops fulfills offline |
| **Pros** | No fake hosting UI; tracks demand |
| **Cons** | Without a provider, requests cannot be fulfilled honestly; invents support queue product |
| **Fit now** | Premature |

### B. Provider-assisted manual provisioning

| | |
|--|--|
| **Idea** | Approved provider; ops creates mailboxes in provider console; BlessBoard records metadata (address, branch, status) only |
| **Pros** | Matches “assisted onboarding”; no password storage in BB |
| **Cons** | **Requires provider selection** (forbidden in this prompt) |
| **Fit now** | Blocked on EXTERNAL PROVIDER |

### C. Automated provider integration

| | |
|--|--|
| **Idea** | API provision/deprovision from BlessBoard |
| **Pros** | Scale |
| **Cons** | Invents APIs / vendor; jobs disabled on V5 foundation; out of scope |
| **Fit now** | Reject |

### D. Remove or defer bundled mailbox claim until provider selected

| | |
|--|--|
| **Idea** | Stop selling “hosted mailboxes included / live” until provider + Model B/C approved; keep SoT capacity number for future |
| **Pros** | Matches runtime honesty (`custom_email` false, limit 0); aligns with commercial reconciliation spirit |
| **Cons** | Pricing decision §1–§2 still list mailboxes — needs an explicit SoT/marketing scrub |
| **Fit now** | **Recommended** |

---

## 4. Recommendation

1. **Do not implement mailbox hosting** (confirmed).  
2. **Defer / soften the public “included hosted mailboxes” claim** until an external provider is approved in a separate ops decision (not this document). Prefer “by arrangement / assisted when email hosting is enabled” language — same honesty pattern used for API/webhooks.  
3. **Keep** catalogue constant `NETWORK_MAILBOXES_PER_BRANCH = 5` as the **future** allowance SoT.  
4. **Keep** FEATURE_KEYS inactive (`custom_email` false, `max_mailboxes_per_branch` 0) — do not raise until provider + provision path exist.  
5. **Do not** build manual request workflow (A) or automated integration (C) in the next batch.  
6. After a provider is approved offline: revisit **B** (assisted metadata + entitlement enforcement), then optionally C.

---

## 5. Required product decisions (still open)

| # | Decision | Blocks |
|---|----------|--------|
| M1 | Approve (or permanently refuse) an external mailbox **hosting** provider | Any live mailbox fulfillment |
| M2 | Scrub vs retain public Network bullet “Up to 5 hosted mailboxes…” | Marketing honesty |
| M3 | Whether allowance is **per active branch** including HQ row (same as `max_branches` counting) | Future entitlement math |
| M4 | Downgrade: who deletes provider mailboxes and SLA | Network → Growth process |
| M5 | Whether custom domain must be verified before any mailbox on that domain | Ordering vs domain Model A |
| M6 | Whether BlessBoard ever stores mailbox **metadata** (address, status) without credentials | Schema for Model B |

---

## 6. Safe next batch

| Batch | Scope | Stop conditions |
|-------|--------|-----------------|
| **NW-MB-01** | Commercial honesty pass: pricing FAQ / `platformPricingContent` / comparison table — Network mailboxes as **deferred / by arrangement**, not live self-serve; tests guard against “mailbox hosting available” claims; update coverage + blocked docs | No schema · no provider · no request-ticket GUI · no FEATURE_KEYS=true |

**Not in next batch:** mailbox tables, PA/HQ mailbox CRUD, password fields, MX automation, provider SDKs.

---

## 7. Conclude (prompt labels)

| Label | Selected |
|-------|:--------:|
| IMPLEMENT MANUAL REQUEST WORKFLOW | No |
| EXTERNAL PROVIDER REQUIRED | Yes (for any real hosting) |
| **REMOVE OR DEFER CLAIM** | **Yes (primary product conclusion)** |

---

## Stop

Decision recorded. No mailbox hosting, provider selection, or APIs invented.
