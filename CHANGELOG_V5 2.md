# BlessBoard V5 — Changelog

**Release identifier (recommended):** `blessboard-v5.0.0-rc.1`  
**Date:** 2026-07-19  
**Branch:** `V5`  
**Scope:** BlessBoard platform foundation on `blessboard.org` (multi-schema Postgres + V5 HTTP).  
**Not a Git tag / GitHub Release** — documentation only.  
**Companion:** [`docs/release/V5_RELEASE_VERSIONING.md`](./docs/release/V5_RELEASE_VERSIONING.md) · [`docs/release/V5_RELEASE_BLOCKERS.md`](./docs/release/V5_RELEASE_BLOCKERS.md)

`package.json` remains **`1.0.0`** (GetPro monorepo placeholder). No approved policy requires bumping it for this BlessBoard V5 RC.

---

## Summary

BlessBoard V5 introduces a **clean multi-schema foundation** (platform + blessboard (+ reserved getpro/ngo shells)), **deployment-scoped sessions**, **hostname-based tenant resolution**, and **feature-flagged tenant routing** (`off` → `shadow` → `authoritative` with optional pilot host allow-list). Public packages are **Foundation / Growth / Network** (platform keys still `free` / `growth` / `professional` / `partner` until plan-key cutover). Local automated regression is strong; **hosted shadow evidence, demo personas/CMS, authoritative pilot, and production V4→V5 cutover remain gated**.

---

## Database foundation

- Multi-schema Postgres: `platform`, `blessboard`, empty `getpro` / `ngo` shells
- Foundation migrator + seeds (deployments, products, plans/features, identity)
- Identity gate: `DATABASE_IDENTITY_EXPECTED` / `platform.database_identity`
- No legacy `public.tenants` / `public.session` on V5
- V5 uses `DATABASE_URL` only; `GETPRO_DATABASE_URL` must stay unset on V5 Hostinger
- Domains registry (`platform.domains`): canonical / custom / alias / apex; immutable hostname uniqueness

---

## Tenant architecture

- Organization → BlessBoard enrolment → church → HQ + primary branch catalogue
- Hostname resolve + deployment comparison (`PLATFORM_DEPLOYMENT_CODE`)
- Tenant routing modes: `off` | `shadow` | `authoritative` (never inferred from `NODE_ENV` / hostname / Git)
- Pilot blast-radius control: `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST` (exact hosts or explicit `*`; empty + authoritative fails closed)
- Custom / alias domains resolve like canonical when active; live CMS still requires authoritative + allow-list membership

---

## Authentication and sessions

- Apex `/login`, `/logout`, `/account` on V5 foundation
- Tenant login via apex transfer (`/login` → apex → `/auth/callback`); hostname-bound, short TTL, single-use
- Host-only session cookies (no `Domain=.blessboard.org`)
- Deployment-scoped `platform.deployment_sessions`
- CSRF double-submit (cookie intentionally not HttpOnly)

---

## Authorization

- Roles: `platform_admin`, `church_hq_admin`, `branch_admin`, member memberships
- Tenant role matrix enforced on HQ / branch-admin / platform-admin surfaces
- Entitlement soft/hard gates for package limits and Network features
- Fail-closed on inactive org / enrolment / church / branches

---

## Apex website

- Marketing / platform public: home, features, pricing, FAQ, directory, for-churches, register-church enquiry
- Sacred Modernity / Stitch-aligned chrome where implemented
- Honest commercial copy for Foundation / Growth / Network (no live checkout)

---

## Tenant public website

- Authoritative published CMS pages (`home`, `about`, leadership, ministries, events, sermons, contact, giving, …)
- Info-only contact / giving (no payment processor)
- Registration entry → submitted state (waiting-verification session deferred)
- Shadow / allow-list deny / routing off → foundation HTML (not tenant CMS)

---

## Member portal

- Dashboard, profile, announcements, events, ministries, resources, forms, requests, giving info
- Prayer as requests category (dedicated `/member/prayer` deferred)
- Branch membership scoped

---

## Branch administration

- Registrations, members, announcements, attendance, giving, CMS, forms, requests, resources, settings, media
- Fixed branch-admin role assign path (via HQ/CLI)
- Monthly reports / departments / duty roster deferred

---

## HQ administration

- Dashboard, branches, members, registrations, content, announcements, participation, attendance, giving, forms, resources, requests, settings, account, audit
- Reports hub: basic aggregates; Growth/Network advanced attendance/giving detail when entitled
- Fixed HQ/branch admin roles UI (not full custom RBAC matrix)
- Network: executive dashboard / governance audit when entitled (`executive_reports`, `advanced_audit`)
- Org templates / scheduled broadcasts deferred

---

## Platform administration

- Organizations, domains, plans/subscriptions/entitlements, audit list, deployment-aware shells
- Create organization CLI-first (PA create-org GUI deferred / low priority)
- Domain status / org assignment; custom insert gated by Network `custom_domain`
- No DNS/SSL automation UI; no billing checkout UI

---

## Foundation package

- List **USD 0** / month; display name Foundation; runtime plan key `free` (until plan-key migration)
- Max **1** active branch (HQ counts); soft member/staff caps; basic reports only
- Growth detail reports denied with honest HTML (no aggregate leak)

---

## Growth package

- List **USD 14.99** / active billable branch / month; runtime `growth`
- Unlimited branches; advanced reports; Foundation surfaces retained
- No custom domain / hosted email / API / webhooks
- Catalogue “scheduling & advanced workflows” **not** live V5 product (deferred honesty)

---

## Network package

- List **USD 29.99** / active billable branch / month; runtime `professional` (display Network)
- Custom domain / custom email feature keys; executive dashboard; governance audit (implemented scope)
- Mailboxes, public API, webhooks, integration registry, DNS/TLS automation — **external / blocked / design-only** where marked in Network docs
- Assisted commercial posture; not self-serve checkout

---

## Media

- Upload allowlists + magic-byte checks; private vs public delivery paths
- Soft-archive; no malware scan; church-scoped library among entitled admins
- V4→V5 media **metadata** migrate; **blob copy deferred** (production risk if waived)

---

## Security

- Host-only cookies; transfer hostname bind; CSRF on mutating POSTs
- Safe logging / request IDs; redacted transfer query params; audit metadata allowlist
- No parent-domain session sharing; no V5→V4 reverse-write
- Authoritative host allow-list fail-closed when empty
- Shadow log validator for local redacted evidence (`verify:v5:shadow-log`)

---

## Testing

- Large V5 regression battery (auth, sessions, CSRF, authz, routing, shells, modules, entitlements, provisioning, migration unit/tooling)
- Three-package regression report: **661** TAP pass / **0** fail (local; hosted gates separate)
- Custom-domain routing tests; authoritative allow-list tests; demo dataset local rehearsal tooling
- Hosted E2E / shadow evidence / authoritative smoke still **manual / blocked** by release blockers

---

## Migration tooling

- `migrate:v4-to-v5:{plan,dry-run,apply,verify,rehearsal}` with explicit source/target URLs + identity
- Hardened transforms (orphans, sample quarantine, domain safety, GETPRO refuse, apply-summary)
- Plan-key Phase B **documented / NOT READY** (insert+repoint; partner gated)
- Combined migration order runbook (ordering-ready; not end-to-end execution-ready)
- Demo V5 dataset CLI (dry-run default, `--confirm` writes)

---

## Deployment tooling

- `db:migrate` / `db:bootstrap:foundation` / `db:verify:foundation` / identity CLI
- Hosted Supabase + Hostinger cutover / shadow / authoritative runbooks
- Env reference + validation helpers; foundation deployment pairing (`blessboard-org-v5` + `DEPLOYMENT_ENV=testing`)
- Jobs disabled in V5 foundation mode
- Authoritative pilot allow-list env (not enabled in Hostinger by this changelog)

---

## Known limitations

See also [`docs/release/V5_RELEASE_BLOCKERS.md`](./docs/release/V5_RELEASE_BLOCKERS.md).

| Topic | Status |
|-------|--------|
| Live shadow evidence pack | **MISSING** (B01) |
| Demo personas / published CMS / samples | **MISSING** (B02–B04) |
| Authoritative pilot approval + smoke | **NOT READY** (B05, B09) |
| Hosted V4→V5 dry-run/apply | **PENDING** (B06, H01) |
| Media blob copy | **DEFERRED** (B08) |
| `plan_key` → foundation/network vocabulary | **NOT READY** (B12, C01–C04) |
| Payment / QR / processor checkout | Not in V5 |
| Forgot password / waiting-verification session | Deferred |
| DNS/SSL automation, mailbox SaaS, public API, webhooks | External / design / blocked |
| Create Organization GUI | CLI-only |
| Stylelint debt outside `public/blessboard/v5/` | Pre-existing; not package logic |

---

## Migration requirements (operators)

1. Target V5 DB: foundation migrate + identity init + verify (no legacy public app tables).  
2. Never point V5 at legacy DB / never set `GETPRO_DATABASE_URL` on V5.  
3. V4→V5: explicit `V4_SOURCE_*` / `V5_TARGET_*`; dry-run before apply; reconciliation template; no reverse-write.  
4. Plan-key remount only after READY + G1–G6 (not part of this RC).  
5. Demo data via V5 provision / `demo:v5:*` — never `church:seed-demos` on foundation.

## Environment requirements

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | V5 foundation only |
| `DATABASE_IDENTITY_EXPECTED` | e.g. `blessboard-platform-v5` |
| `PLATFORM_DEPLOYMENT_CODE` | `blessboard-org-v5` |
| `DEPLOYMENT_ENV` | `testing` until promote approved |
| `BLESSBOARD_TENANT_ROUTING_MODE` | Default `off`; shadow/authoritative manual only |
| `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST` | Required for safe authoritative pilot; empty fails closed |
| `SESSION_SECRET` | ≥32 chars in production |
| `BLESSBOARD_JOBS_ENABLED` | `0` on V5 foundation |
| `GETPRO_DATABASE_URL` | **Unset** on V5 |

## Backward compatibility

- V4 (`blessboard.com` / legacy DB) remains separate until cutover; dual-write forbidden after SoR flip.  
- Public package **names** already Foundation/Growth/Network via aliases; persisted keys still legacy until plan-key migration.  
- Church billing cents drift (1490 vs 1499) is a separate ticket — not folded into plan-key.  
- Tenant login is apex transfer (not in-page tenant password card).

## Deferred features / external dependencies

Deferred product: prayer dedicated route, BA monthly reports, departments/duty, HQ org templates, scheduled jobs, forgot password, PA create-org GUI, full custom RBAC, malware scan.  

External: Hostinger TLS/DNS, registrar, mailbox vendor, API/webhook consumers, payment processors, media object storage backup/versioning.

---

## Suggested documentation commit message

```
docs(release): add BlessBoard V5 RC changelog and versioning guide

Record blessboard-v5.0.0-rc.1 without tagging or bumping package.json;
summarize foundation through deployment tooling and known blockers.
```
