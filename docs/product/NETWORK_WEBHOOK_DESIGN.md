# Network webhook design and delivery audit (BlessBoard V5)

**Date:** 2026-07-19  
**Branch:** `V5`  
**Mode:** Product / security design only — **do not implement webhooks**  
**Constraint:** Do not include confidential prayer, pastoral, password, session, giving-account, or private member data in any payload  

**Companions:** [`NETWORK_API_ACCESS_DESIGN.md`](./NETWORK_API_ACCESS_DESIGN.md) · [`NETWORK_ENTITLEMENT_MATRIX.md`](./NETWORK_ENTITLEMENT_MATRIX.md) · [`NETWORK_BLOCKED_FEATURES.md`](./NETWORK_BLOCKED_FEATURES.md) (B3 / N2) · [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](./NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) · [`V5_DATA_RETENTION_PRIVACY_INVENTORY.md`](../security/V5_DATA_RETENTION_PRIVACY_INVENTORY.md) · [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md) · [`docs/database/ARCHITECTURE.md`](../database/ARCHITECTURE.md) (jobs)

---

## Verdict

### **JOB INFRASTRUCTURE REQUIRED**

Webhooks are **not** ready to implement on Network V5. Durable outbound delivery (outbox + worker + retries) does **not** exist for webhooks, and V5 foundation mode **always disables** BlessBoard cron/ops jobs.

| Conclude label | Selected |
|----------------|:--------:|
| READY TO IMPLEMENT | No |
| **JOB INFRASTRUCTURE REQUIRED** | **Yes (primary)** |
| PRODUCT DECISION REQUIRED | Concurrent — N2 unsigned (self-serve vs assisted; whether webhooks ship as software) |
| DEFER | Acceptable commercial fallback (“by arrangement” only; keep `webhooks` **false**) |

**Safest posture until blockers clear:** keep `FEATURE_KEYS.webhooks = false`; keep catalogue `/hq/integrations/webhooks` locked; do not invent endpoint GUI that implies live delivery.

---

## 1. Repository evidence

| Area | Finding |
|------|---------|
| Runtime entitlement | `webhooks` = **false** on free / growth / professional / partner seeds |
| Commercial catalogue | Network `integrations.webhooks` aspirational — not a live FEATURE_KEY |
| V5 routes | No webhook endpoint registry, signing-secret store, delivery attempts, or outbound POST worker |
| HQ / tests | Catalogue path gated; V4-era church tests assert webhook POST → **409** locked |
| Stitch | No dedicated webhook-admin Stitch SoT for live delivery |
| Durable job runner | **No** general outbox / pg-boss / Bull / Agenda bus for tenant webhooks |
| Existing cron scripts | V4-oriented: scheduled broadcasts, scheduled reports, growth trial, dormancy — gated by `blessBoardJobsGate` / `BLESSBOARD_JOBS_ENABLED` |
| V5 jobs policy | Architecture: `blessboard-org-v5` → `jobs_enabled = false`; `areBlessBoardJobsEnabled()` returns **false** in V5 foundation mode |
| Secret patterns | Session / API-design: **hash-only** at rest; HMAC-SHA256 used for CSRF / package assignment — no webhook signing secret table |
| Audit | Append-only `platform.audit_events` with metadata allowlist (no secrets / private bodies) |

### Durable job runner assessment

| Question | Answer |
|----------|--------|
| Is there a durable webhook outbox? | **No** |
| Is there a retryable delivery attempt table? | **No** |
| Can V5 Hostinger cron safely own webhook delivery today? | **No** — jobs master-switch off in foundation mode; no webhook script |
| Closest existing pattern | Broadcast/report cron claim + `job_key` / delivery idempotency on **V4** — domain-specific, not a reusable webhook bus, and **not approved for V5** scheduled product |

**Implication:** Even with a perfect event catalog and signing design, shipping webhooks without a V5-approved durable runner would force unsafe in-request HTTP fan-out (lost on crash, no backoff, no pause, no audit of attempts).

---

## 2. Purpose (recommended)

Notify **trusted church/network IT systems** (and GetPro-assisted integrators) of **approved, church-scoped domain changes** via signed HTTPS POST — not to replace HQ HTML, not to stream member private data, and not to act as a public realtime bus.

**Non-goals (v1):** inbound webhooks into BlessBoard, GraphQL subscriptions, browser-delivered events, write-back from receivers, marketplace connectors, prayer/pastoral streams.

---

## 3. Tenant scope

| Binding | Rule |
|---------|------|
| Organization | Endpoint bound to one `organization_id` |
| Church | Endpoint bound to one `church_id` (UUID); host/tenant resolution must match |
| Branch | Optional `branch_id` filter on the subscription; omit = all active branches of that church |
| Cross-tenant | Never deliver events for another church/org; reject misconfigured targets at enqueue time |
| Foundation / Growth | `assertFeature(webhooks)` fail-closed; no Network catalogue override |

---

## 4. Network entitlement

| Topic | Decision |
|-------|----------|
| FEATURE_KEY | `webhooks` (already reserved) |
| Plans until activation | Remain **false** on all packages |
| Activation | Only after N2 + job infrastructure; prefer **assisted** create (PA / ops) unless product explicitly approves HQ self-serve |
| Enforcement | Assert on: endpoint create/update, test delivery, and every enqueue/delivery attempt |
| Downgrade | Disable endpoints + stop enqueue; leave historical attempt rows for audit retention policy |

Companion commercial language stays **by arrangement** until the key is true.

---

## 5. Approved event types (design allowlist)

Names are illustrative stable strings; implement only after READY + job infra.

### Safe first event types (v1 candidates)

| Event type | When | Payload intent |
|------------|------|----------------|
| `branch.created` | Branch row created | Public identity: id, key, display name, type, status |
| `branch.updated` | Material public fields change | Same fields + changed keys list (no private notes) |
| `branch.status_changed` | Active ↔ inactive (or equivalent) | id, previous/new status |
| `event.published` | Public event becomes published | Public catalogue fields only |
| `event.unpublished` | Published → draft/archived | id, status, timestamps |
| `announcement.published` | Announcement status published | id, title, published_at, branch_id if any — **not** draft bodies by default if body can hold private content; prefer title + link metadata |
| `attendance.summary.finalized` | HQ/branch attendance summary approved/archived (aggregate product) | Period, branch_id, category totals — **no person rows** |
| `giving.summary.recorded` | Monthly/period giving aggregate available | Period, currency, category/branch totals — **no donors, no instruments** |

Align payloads with [`NETWORK_API_ACCESS_DESIGN.md`](./NETWORK_API_ACCESS_DESIGN.md) §6–7 read models where possible.

### Explicitly not approved (v1)

| Event / data | Reason |
|--------------|--------|
| Prayer request bodies / status streams | Confidential |
| Pastoral care notes / appointments detail | Confidential |
| Password reset, session create/revoke, CSRF | Security |
| Giving **accounts**, payment instruments, donor identity | FINANCIAL + privacy |
| Member directory create/update with PII | Privacy inventory |
| Form submission answers | HIGH sensitivity |
| Individual attendance check-in person-level | Not in aggregate product |
| Media binary / private asset URLs with long-lived secrets | Attachment security |
| Platform-admin / cross-org events | Tenant isolation |

---

## 6. Payload minimization

| Rule | Detail |
|------|--------|
| Envelope only + IDs | Prefer `organization_id`, `church_id`, `branch_id`, resource `id`, `occurred_at`, `event_type`, `delivery_id` |
| No PII dump | No email, phone, address, national ID, passwords, tokens |
| No message bodies | No prayer/pastoral/request/form answer text |
| No financial instruments | Aggregate amounts only when event is giving summary |
| Fetch-further | Receivers that need more use approved **read API** (when shipped) with scoped keys — webhooks are signals, not warehouses |
| Size cap | Soft max body size (e.g. ≤ 64 KiB); reject oversized event construction |
| Deterministic JSON | Stable key order not required; stable schema version field `api_version: "webhook.v1"` |

Illustrative (fictional) envelope:

```json
{
  "api_version": "webhook.v1",
  "event_type": "event.published",
  "event_id": "evt_01JEXAMPLE000000000000000",
  "delivery_id": "dlv_01JEXAMPLE000000000000001",
  "occurred_at": "2026-07-19T12:00:00.000Z",
  "organization_id": "11111111-1111-4111-8111-111111111111",
  "church_id": "22222222-2222-4222-8222-222222222222",
  "branch_id": "33333333-3333-4333-8333-333333333333",
  "data": {
    "id": "44444444-4444-4444-8444-444444444444",
    "title": "Sunday Gathering",
    "starts_at": "2026-07-20T09:00:00.000Z",
    "status": "published"
  }
}
```

---

## 7. Endpoint validation

| Check | Rule |
|-------|------|
| Scheme | **HTTPS only** (reject `http://`, `ftp://`, data URLs, blank) |
| Host | Public hostname; reject localhost / `.local` / link-local / private RFC1918 / metadata IPs (SSRF) |
| Port | Default 443 only unless product later allows explicit allowlisted ports |
| Path | Absolute URL path; no credentials in URL (`https://user:pass@…` rejected) |
| Redirects | **Do not follow** redirects on delivery (prevent open redirect → SSRF) |
| DNS | Resolve at delivery time; re-check against private IP ranges after resolve |
| Ownership | Optional later: domain ownership proof; not required for assisted v1 if PA validates |
| Subscription | Endpoint registers allowlisted `event_types[]`; unknown types rejected at create |

---

## 8. HTTPS requirement

- TLS 1.2+ to subscriber.  
- Certificate validation **on** (no insecure skip).  
- No HTTP fallback, including “dev mode” in production deployments.  
- Test deliveries obey the same HTTPS rules.

---

## 9. Signing secret

| Topic | Decision |
|-------|----------|
| Create | Generate cryptographically random secret (e.g. 32+ bytes); show **once** as `bb_whsec_…` |
| Storage | Store **SHA-256 hash only** (same posture as sessions / proposed API keys); optional prefix + last4 for UI |
| Never | Log raw secret; return in list endpoints; embed in audit metadata; put in EJS |
| Per endpoint | One active signing secret; rotation creates new secret and retires old after grace |

---

## 10. Signature algorithm

Recommended industry-compatible default:

| Item | Value |
|------|-------|
| Header | `BlessBoard-Signature` (and/or `X-BlessBoard-Signature`) |
| Scheme | `t={unix_seconds},v1={hex_hmac}` |
| MAC | `HMAC-SHA256(secret, "{t}.{raw_body}")` |
| Body | Exact raw request bytes used for MAC |
| Multiple v1 | Support rotated secrets during grace (try current, then previous) |

Do **not** use MD5/SHA1 MAC. Do not put the raw secret in headers.

---

## 11. Timestamp and replay protection

| Control | Rule |
|---------|------|
| Timestamp `t` | Unix seconds in signature header; also `occurred_at` / `delivery_id` in JSON |
| Skew window | Reject if `|now - t|` > 5 minutes (configurable ops SoT) |
| Idempotency | `delivery_id` unique per attempt; subscriber should ignore duplicates |
| Replay | Same `delivery_id` + body must not be accepted as a new business event; BlessBoard retries may re-POST the **same** delivery_id |
| Nonce | Optional `event_id` stable for the domain occurrence across retries of the same logical event |

---

## 12. Delivery retries and backoff

Requires durable outbox (see §1). Design target when infra exists:

| Parameter | Proposed default |
|-----------|------------------|
| Max attempts | 8 |
| Backoff | Exponential with jitter: e.g. 1m → 5m → 15m → 1h → 6h → 24h → … |
| Success | HTTP **2xx** only |
| Retryable | Timeouts, 408, 429, 5xx |
| Non-retryable | 400, 401, 403, 404, 410, invalid TLS, SSRF reject |
| Concurrency | Cap per org / per endpoint to protect BlessBoard egress |

In-request synchronous fan-out from HTTP handlers is **forbidden**.

---

## 13. Failure states

| State | Meaning |
|-------|---------|
| `pending` | Enqueued, not yet attempted |
| `delivering` | Claimed by worker |
| `succeeded` | 2xx recorded |
| `retrying` | Failed retryable; next_attempt_at set |
| `failed` | Exhausted attempts or non-retryable |
| `cancelled` | Endpoint disabled / org downgrade mid-flight |

Surfaces: PA/HQ delivery log (metadata only: status, HTTP code, latency, error class — not response bodies with secrets).

---

## 14. Pause / disable behavior

| Action | Effect |
|--------|--------|
| Pause endpoint | Stop new enqueue; in-flight attempts finish or cancel per policy; keep config |
| Disable / revoke | Pause + mark inactive; reject test delivery; rotate invalidates secret |
| Entitlement loss | Equivalent to disable for enqueue; audit `webhook.endpoint.disabled` |
| Branch filter change | Applies to new events only |

---

## 15. Audit logging

| Action examples | Metadata (allowlist) |
|-----------------|----------------------|
| `webhook.endpoint.created` / `updated` / `paused` / `disabled` | endpoint id, URL host (not full URL if query has secrets), event_types, actor |
| `webhook.secret.rotated` | endpoint id; **never** secret |
| `webhook.delivery.succeeded` / `failed` / `exhausted` | delivery_id, event_type, attempt, HTTP status class |
| `webhook.test.requested` | endpoint id, outcome |

No raw payloads with private fields in audit; no signing secrets; no subscriber response bodies.

---

## 16. Payload retention

| Store | Retention posture |
|-------|-------------------|
| Outbox payload | Keep until terminal success/failure **or** short TTL (e.g. 7–30 days) then drop body, keep attempt metadata |
| Delivery attempt log | Status + codes longer (align platform audit retention); bodies minimized or omitted |
| Redelivery | After body purge, only metadata remains — no silent rehydrate of private data |

Exact days = ops/privacy SoT; must not exceed privacy inventory expectations for similar operational logs.

---

## 17. Secret rotation

1. Generate new secret; show once.  
2. Store new hash as current; keep previous hash for grace (e.g. 24h).  
3. Sign with current; verify path on subscriber docs shows dual-secret verify.  
4. After grace, drop previous hash.  
5. Audit rotation; force rotation on suspected leak.

---

## 18. Test delivery

| Rule | Detail |
|------|--------|
| Entitlement | `webhooks` required |
| Authz | HQ admin (or PA assisted) for that church only |
| Payload | Synthetic `webhook.test` event — **no** production private data |
| Path | Same HTTPS, signing, SSRF checks as production |
| Rate | Strict per-endpoint rate limit |
| Audit | `webhook.test.requested` + result |

Do not use test delivery to exfiltrate member rows.

---

## 19. Relationship to API access (N2)

| Capability | Dependency |
|------------|------------|
| Webhooks alone | Possible as “signal only” if receivers do not need pull API |
| Practical integrations | Usually need **both** signed events + read API aggregates ([`NETWORK_API_ACCESS_DESIGN.md`](./NETWORK_API_ACCESS_DESIGN.md)) |
| Product N2 | Covers API **and** webhook protocol / assisted vs self-serve |

Do not ship webhook admin that promises API fetch-further before API readiness is decided.

---

## 20. Required infrastructure before READY TO IMPLEMENT

| # | Dependency |
|---|------------|
| J1 | Durable **outbox** table(s): event, payload hash/body policy, church/org scope |
| J2 | **Delivery attempts** with next_attempt_at, attempt count, terminal state |
| J3 | V5-approved **worker** entrypoint (cron or queue consumer) that is allowed to run when Network webhooks are sold — not silent in-request POST |
| J4 | Endpoint registry + hashed signing secrets + pause/disable |
| J5 | SSRF-safe HTTPS client (no redirects, private IP deny) |
| J6 | `webhooks` entitlement wiring + Growth denial tests |
| J7 | Audit actions without secrets |
| J8 | Product close on **N2** (assisted vs self-serve; ship vs permanent defer) |

Until J1–J3 exist for V5, conclusion remains **JOB INFRASTRUCTURE REQUIRED**.

---

## 21. Blockers (summary)

1. **No durable webhook job/outbox runner on V5** (primary).  
2. **N2 unsigned** — protocol + commercial activation model.  
3. **`webhooks` FEATURE_KEY inactive** by design.  
4. **No endpoint / secret / attempt schema.**  
5. **V5 jobs disabled** in foundation mode — cannot piggyback “just enable cron” without an explicit jobs architecture decision for Network webhooks.  
6. API pull-side still gated (weakens integrators if webhooks ship alone without fetch-further).

---

## 22. Safe next steps (documentation / product only)

| ID | Action | Do not |
|----|--------|--------|
| NW-WH-01 | Product closes N2 for webhooks (ship vs defer; assisted vs self-serve) | Implement delivery |
| NW-WH-02 | Architecture spike: V5 outbox + worker approval (may share patterns with future scheduled comms) | Reuse V4 cron blindly on V5 |
| NW-WH-03 | Keep marketing “by arrangement”; entitlement honesty tests | HQ GUI that implies live webhooks |

**First implementation slice (only after READY + jobs):** endpoint create (assisted) + `webhook.test` + one production event type (`event.published` or `branch.created`) + retries/backoff + Growth denial — still no private member/prayer/pastoral/giving-account payloads.

---

## Stop

Design and delivery audit complete. **Do not implement webhooks** from this document. Re-open only when job infrastructure is approved for V5 **and** N2 selects a ship path — then re-label toward **READY TO IMPLEMENT**.
