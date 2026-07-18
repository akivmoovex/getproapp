# BlessBoard V5 — Demo tenant end-to-end smoke-test plan

**Date:** 2026-07-18  
**Purpose:** Final manual smoke plan for one BlessBoard V5 demo tenant after catalogue readiness + test users/content are in place.  
**Constraint:** Documentation only. Does **not** change application code, seed data, or authorize deploy.  
**Companions:** [`V5_DEMO_TENANT_READINESS.md`](./V5_DEMO_TENANT_READINESS.md) · [`V5_GUI_PRODUCTION_SMOKE_TEST.md`](../ui/V5_GUI_PRODUCTION_SMOKE_TEST.md) · [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md)

---

## 0. Execution readiness

| Question | Answer |
|----------|--------|
| Is this **plan** complete and ready to execute? | **YES** — journey, checklists, evidence, and rollback are defined. |
| Can operators run it **against hosted data today**? | **NO** until [`V5_DEMO_TENANT_READINESS.md`](./V5_DEMO_TENANT_READINESS.md) full-E2E gaps are closed (users, published Home/About, sample module rows) **and** `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` after shadow sign-off. |

### Hosts (fill before run)

| Alias | Value (current demo candidate) | Used for |
|-------|--------------------------------|----------|
| **Apex** | `https://blessboard.org` | Marketing, login, account, platform admin |
| **Tenant** | `https://diagnostic.blessboard.org` | Public CMS, register, transfer, portals |
| **Org key** | `diagnostic-church` | Platform / HQ / roles |
| **Church key** | `diagnostic-church` | Role assign / verification |
| **Primary branch key** | `hq` | Branch admin scope (HQ is primary) |
| **Deployment** | `blessboard-org-v5` | Session / routing identity |

### Required personas (create before run)

| Persona | Role key | Notes |
|---------|----------|-------|
| **PA** | `platform_admin` | Apex `/admin*` |
| **HQ** | `church_hq_admin` | Tenant `/hq*` |
| **BA** | `branch_admin` on `hq` | Tenant `/branch-admin*` |
| **MEM** | active member + primary membership on `hq` | Tenant `/member*` |
| **ANON** | none | Public pages |

Use private/incognito windows per persona. Never reuse a staff session for member checks.

### Routing mode gates

| Phase | Mode | Smoke allowed |
|-------|------|---------------|
| Preflight | `off` or `shadow` | Apex-only + shadow log checks (not full tenant CMS) |
| Full journey (this plan) | `authoritative` | All rows below |
| On failure | set `off`, restart | Re-check Apex `/healthz` + `/login` |

### Marking

Each test: ☐ Pass · ☐ Fail · ☐ Blocked (precondition) · ☐ Skip (reason)

---

## 1. Journey tests

### T01 — Apex homepage

| Field | Detail |
|-------|--------|
| **Route** | `GET /` on **Apex** |
| **Role** | ANON (optional: any signed-in) |
| **Setup** | App healthy; apex marketing assets deployable |
| **Action** | Open Apex home; scroll hero → capabilities → footer |
| **Expected result** | **200**; Sacred Modernity apex chrome; nav includes Home / Pricing / Directory / Login (or Account); footer Powered by GetPro; no tenant CMS chrome; no fabricated org KPIs |
| **Failure evidence** | Desktop+mobile screenshots; response status; View Source CSS `?v=`; note if GetPro/V4 shell appears |
| **Rollback / cleanup** | If 5xx or wrong product shell → set routing `off`, restart, stop smoke. No DB cleanup. |

### T02 — Pricing and directory

| Field | Detail |
|-------|--------|
| **Route** | `GET /pricing`, `GET /directory` on **Apex** (optional: `/features`, `/for-churches`) |
| **Role** | ANON |
| **Setup** | Same as T01; directory may list testing/demo orgs only when env allows |
| **Action** | Open Pricing; open Directory; try search if present; follow one listed tenant link if shown |
| **Expected result** | Both **200**; Pricing has no live checkout; Directory shows safe org labels/hosts only (no UUIDs/secrets); dead nav links absent |
| **Failure evidence** | Screenshots; HAR for failed assets; list of broken `href`s |
| **Rollback / cleanup** | None for content; if directory leaks UUIDs/secrets → stop and treat as security fail (T18). |

### T03 — Tenant homepage

| Field | Detail |
|-------|--------|
| **Route** | `GET /` on **Tenant** |
| **Role** | ANON |
| **Setup** | Authoritative routing; published `home` (or honest empty); active org/church/domain |
| **Action** | Open tenant `/`; check header, main, footer, Sign in link |
| **Expected result** | **200** tenant public shell; church display name; published Home content **or** intentional empty; apex link present; **no** HQ/admin links in public chrome; no UUID leakage |
| **Failure evidence** | Screenshot first viewport; HTML snippet of title/h1; Host header used |
| **Rollback / cleanup** | If apex marketing renders on tenant host → routing misconfig: set `off`, restart. |

### T04 — Tenant login redirect

| Field | Detail |
|-------|--------|
| **Route** | `GET /login` on **Tenant** (optional `?next=/member` or `?next=/hq`) |
| **Role** | ANON |
| **Setup** | Authoritative tenant resolution |
| **Action** | Click Sign in or open `/login` |
| **Expected result** | Redirect to Apex `/login?tr=…` (transfer id); **no** tenant password form; HTML never embeds raw transfer secrets beyond opaque `tr` query |
| **Failure evidence** | Location header / final URL; page source search for token-like strings |
| **Rollback / cleanup** | Abandoned transfers expire via product TTL; no manual cleanup required. |

### T05 — Apex authentication

| Field | Detail |
|-------|--------|
| **Route** | `GET/POST /login` on **Apex** |
| **Role** | ANON → PA / HQ / BA / MEM (run once per persona) |
| **Setup** | Known active user + password; CSRF cookie/field present |
| **Action** | Submit valid credentials; separately submit invalid password |
| **Expected result** | Valid → **303** to `/`, `/account`, or transfer continuation; invalid → controlled error, no stack; session cookie **host-only** (not `.blessboard.org` parent Domain) |
| **Failure evidence** | DevTools Application → cookie attributes; failed-login screenshot; status codes |
| **Rollback / cleanup** | `POST /logout` with CSRF; close window. |

### T06 — Tenant transfer callback

| Field | Detail |
|-------|--------|
| **Route** | Apex login continuation → Tenant `GET /auth/callback` → destination |
| **Role** | HQ, BA, MEM (separate runs) |
| **Setup** | Start from Tenant `/login?next=/hq` (HQ), `/login?next=/branch-admin` (BA), `/login?next=/member` (MEM) |
| **Action** | Complete apex login from transfer; land on callback then destination |
| **Expected result** | Callback redeems once; lands on allowed `next` (`/hq`, `/branch-admin`, `/member`, `/account`); second callback use fails closed; no open redirect off-host |
| **Failure evidence** | Full redirect chain (HAR); final URL; whether session exists on tenant host |
| **Rollback / cleanup** | Logout on tenant; do not reuse spent `tr` values. |

### T07 — Member registration

| Field | Detail |
|-------|--------|
| **Route** | `GET/POST /register`, `GET /register/submitted` on **Tenant** |
| **Role** | ANON |
| **Setup** | Registration enabled for church; CSRF; unique test email |
| **Action** | Submit valid registration; optionally resubmit duplicate |
| **Expected result** | Valid → redirect/submitted success (pending review); CSRF reject without token; no password/wizard fields beyond V5 schema; rate limit controlled |
| **Failure evidence** | Form payload (redact PII in tickets); status; submitted page screenshot |
| **Rollback / cleanup** | Leave pending row for T08; or reject after review. Do not invent DELETE SQL. |

### T08 — Registration review

| Field | Detail |
|-------|--------|
| **Route** | `GET /branch-admin/registrations`, detail + approve/reject POSTs on **Tenant** |
| **Role** | BA (HQ may oversee read-only at `/hq/registrations`) |
| **Setup** | Pending registration from T07; BA session via T06 |
| **Action** | Open queue; open detail; approve one test registrant (or reject with note) |
| **Expected result** | Queue shows pending; approve creates/activates member + primary membership; HQ list is privacy-limited; no fabricated verification scores |
| **Failure evidence** | Before/after screenshots; role of actor; response status on POST |
| **Rollback / cleanup** | Prefer reject unused applicants; keep one approved MEM for T09. |

### T09 — Member portal

| Field | Detail |
|-------|--------|
| **Route** | `GET /member`, `/member/profile`, `/member/announcements`, `/member/events`, `/member/ministries`, `/member/resources`, `/member/forms`, `/member/requests`, `/member/giving` on **Tenant** |
| **Role** | MEM |
| **Setup** | Active member + primary membership on `hq`; published samples optional (honest empty OK) |
| **Action** | Walk each nav item; edit profile contact fields only; open one request/form if present |
| **Expected result** | Dashboard loads; empty states honest; prayer CTA disabled/absent; no admin chrome; CSRF on POSTs; staff-only roles alone cannot open `/member` |
| **Failure evidence** | Screenshot per module; 403 when using BA/HQ session on `/member` |
| **Rollback / cleanup** | Logout; revert profile edits if needed via UI. |

### T10 — Branch Admin

| Field | Detail |
|-------|--------|
| **Route** | `GET /branch-admin` and modules: `/account`, `/settings`, `/registrations`, `/members`, `/announcements`, `/content`, `/attendance`, `/giving`, `/forms`, `/requests` (+ media picker where wired) on **Tenant** |
| **Role** | BA |
| **Setup** | BA role on `hq`; optional sample published content |
| **Action** | Open dashboard; open each nav item; create/edit one safe draft if policy allows; do not invent metrics |
| **Expected result** | **200** for in-scope routes; sidebar/drawer nav works; empty/no-results honest; CSRF on mutations; no Reports module; no fabricated KPIs |
| **Failure evidence** | Screenshot dashboard + one write flow; POST status without CSRF |
| **Rollback / cleanup** | Archive/unpublish test drafts via UI; logout. |

### T11 — HQ Admin

| Field | Detail |
|-------|--------|
| **Route** | `GET /hq`, `/hq/branches`, `/hq/members`, `/hq/registrations`, `/hq/announcements`, `/hq/content`, `/hq/attendance`, `/hq/giving`, `/hq/forms`, `/hq/resources`, `/hq/requests`, `/hq/reports`, `/hq/audit`, `/hq/settings`, `/hq/account` on **Tenant** |
| **Role** | HQ |
| **Setup** | HQ session; church-scoped data |
| **Action** | Open dashboard; use branch selector if present; open oversight lists; open reports/audit read-only |
| **Expected result** | Live branch count only where wired; no fabricated charts; BA receives **403** on `/hq`; audit shows truncated refs, no secrets |
| **Failure evidence** | 403 page for BA on `/hq`; HQ screenshots; audit row sample (redact) |
| **Rollback / cleanup** | Logout; no audit deletion. |

### T12 — Platform Admin

| Field | Detail |
|-------|--------|
| **Route** | `GET /admin`, `/admin/organizations`, `/admin/organizations/diagnostic-church`, `/admin/plans`, `/admin/subscriptions`, `/admin/domains`, `/admin/deployments`, `/admin/settings`, `/admin/account` on **Apex** |
| **Role** | PA |
| **Setup** | PA session on Apex |
| **Action** | Walk enabled nav; open org detail; confirm unavailable cards stay non-fabricated |
| **Expected result** | Org key `diagnostic-church` visible; no create-org UI; no MRR/uptime inventions; HQ/BA get **403** on `/admin`; secrets never rendered |
| **Failure evidence** | Directory screenshot; 403 as HQ; HTML search for `DATABASE_URL` / `SESSION_SECRET` |
| **Rollback / cleanup** | Avoid entitlement/plan POSTs unless intentionally testing; logout. |

### T13 — Logout

| Field | Detail |
|-------|--------|
| **Route** | `POST /logout` (Apex), `POST /member/logout`, `POST /branch-admin/logout`, `POST /hq/logout` (or shell equivalents) |
| **Role** | Each persona |
| **Setup** | Authenticated session |
| **Action** | Logout with CSRF; then hit a protected route |
| **Expected result** | Session cleared; protected route redirects to login/transfer; CSRF required (403 without token) |
| **Failure evidence** | Cookie jar after logout; status on replay without session |
| **Rollback / cleanup** | None. |

### T14 — Unauthorized-role checks

| Field | Detail |
|-------|--------|
| **Route** | Cross-hit: MEM → `/branch-admin`, `/hq`, `/admin`; BA → `/hq`, `/admin`; HQ → `/admin`; PA → tenant `/member` (should not imply membership) |
| **Role** | Wrong role for target |
| **Setup** | Four persona sessions |
| **Action** | Request each forbidden surface |
| **Expected result** | **403** (HTML forbidden) or controlled redirect policy as implemented; never 200 with other-role data; never UUID dump |
| **Failure evidence** | Status + body snippet per pair; screenshot |
| **Rollback / cleanup** | Close windows. |

### T15 — Inactive church/branch checks

| Field | Detail |
|-------|--------|
| **Route** | Tenant `/` and `/login` under inactive church **or** inactive primary branch (operator-controlled staging only) |
| **Role** | ANON / staff |
| **Setup** | **Only** if a disposable inactive copy exists — do **not** inactivate `diagnostic-church` on shared testing without approval. Prefer a separate throwaway org if available. |
| **Action** | Resolve host; attempt public + login transfer |
| **Expected result** | Controlled unavailable / fail-closed (not 500 stack); no catalogue bypass; shadow/authoritative logs show typed miss if applicable |
| **Failure evidence** | Status body; log line keys only |
| **Rollback / cleanup** | Re-activate only via approved operator procedure; document who changed status. If no safe inactive fixture → mark **Skip** with reason. |

### T16 — Mobile navigation

| Field | Detail |
|-------|--------|
| **Route** | Same hosts as T01–T12 at ≤390px (and 320px spot-check) |
| **Role** | ANON + one staff + MEM |
| **Setup** | Device or DevTools responsive |
| **Action** | Open drawers/bottom tabs; Tab/Escape; follow primary CTAs |
| **Expected result** | No horizontal scroll; focus trap in drawers; bottom tabs match enabled subset; touch targets usable; Powered by GetPro visible where shell requires |
| **Failure evidence** | 320/390 screenshots; video optional; note overflow element |
| **Rollback / cleanup** | None. |

### T17 — Upload / media checks

| Field | Detail |
|-------|--------|
| **Route** | Content-admin media picker/upload (HQ or BA content screens); `GET /_bb/media/:id` for public assets only |
| **Role** | BA or HQ |
| **Setup** | Storage buckets configured; CSRF; allowlisted file (JPEG/PNG/WebP/GIF ≤5MiB or PDF ≤15MiB) |
| **Action** | Open picker; upload valid file; reject SVG/oversize; select into field; archive confirm (soft); attempt private asset as ANON |
| **Expected result** | Upload succeeds with safe UI; CSRF 403 without token; SVG rejected; archive soft-only; ANON cannot fetch private; no storage keys/credentials in HTML/JSON |
| **Failure evidence** | Network panel (status + JSON `reason`); picker screenshots; response headers for media GET |
| **Rollback / cleanup** | Soft-archive test asset via picker confirm; do not hard-delete via invented SQL. |

### T18 — No secret leakage

| Field | Detail |
|-------|--------|
| **Route** | Spot-check Apex `/`, `/login`, `/account`, `/admin/deployments/:code`; Tenant `/`, `/register`, `/member`, `/hq/audit`, `/branch-admin` |
| **Role** | ANON + PA + HQ |
| **Setup** | View Source / search in HTML and JSON |
| **Action** | Search for `DATABASE_URL`, `SESSION_SECRET`, `password`, connection strings, raw transfer tokens, storage keys, cookie names from env |
| **Expected result** | No secrets; deployment diagnostics show pass/fail only; audit refs truncated; org UUIDs not required in directory |
| **Failure evidence** | Exact matching snippet (redact mid-secret); URL; role |
| **Rollback / cleanup** | Treat as release blocker; set routing `off` if actively leaking. |

### T19 — No dead links

| Field | Detail |
|-------|--------|
| **Route** | Primary nav + footer + dashboard quick actions on Apex, Tenant public, Member, BA, HQ, PA |
| **Role** | Matching persona per shell |
| **Setup** | Authoritative mode |
| **Action** | Click every primary nav/footer/quick link once |
| **Expected result** | **200** or intentional disabled/unavailable control; no 404 for enabled nav; unavailable PA cards are non-links |
| **Failure evidence** | Table of `href` → status; screenshot of 404 |
| **Rollback / cleanup** | None (file defect ticket). |

### T20 — No legacy database / session usage

| Field | Detail |
|-------|--------|
| **Route** | N/A (ops + runtime) |
| **Role** | Operator |
| **Setup** | Access to DB verify + app env |
| **Action** | Confirm `to_regclass('public.tenants')` and `to_regclass('public.session')` are null; confirm app uses `DATABASE_URL` + V5 sessions (`PLATFORM_DEPLOYMENT_CODE`, host-only cookie); confirm no `GETPRO_DATABASE_URL` on V5 host |
| **Expected result** | Legacy tables absent; identity `blessboard-platform-v5`; session cookie name host-scoped; no V4 `public.session` store |
| **Failure evidence** | `db:identity:check` / verify foundation output (no secrets); env key presence list (values redacted) |
| **Rollback / cleanup** | Do not recreate legacy tables. |

---

## 2. Desktop checklist (≥1280px)

| # | Check | ☐ |
|---|-------|---|
| D1 | Apex first viewport: brand, hero, CTAs, no KPI clutter | ☐ |
| D2 | Apex Pricing + Directory usable; no checkout | ☐ |
| D3 | Tenant Home desktop nav (not hamburger) | ☐ |
| D4 | Login dual-pane / account chrome | ☐ |
| D5 | Member sidebar ≥900px | ☐ |
| D6 | Branch Admin sidebar + tables | ☐ |
| D7 | HQ sidebar + branch selector | ☐ |
| D8 | Platform Admin dark ops sidebar + tables | ☐ |
| D9 | Focus-visible rings on primary controls | ☐ |
| D10 | No horizontal overflow on main shells | ☐ |

---

## 3. Mobile checklist (≤390px; spot 320px)

| # | Check | ☐ |
|---|-------|---|
| M1 | Apex drawer open/close + Escape | ☐ |
| M2 | Tenant public drawer; no bottom-tab FAB expectation | ☐ |
| M3 | Member bottom tabs + drawer | ☐ |
| M4 | BA / HQ / PA bottom tabs + drawer | ☐ |
| M5 | Forms usable; primary button not clipped by keyboard | ☐ |
| M6 | Media picker drawer stack ≤767px | ☐ |
| M7 | Cards/tables switch to mobile card pattern | ☐ |
| M8 | No horizontal scroll at 320px | ☐ |
| M9 | Touch targets ≥44px on icon toggles | ☐ |
| M10 | Powered by GetPro where shell requires | ☐ |

---

## 4. Database verification checklist

Run **read-only** checks only (documented patterns). Do not invent INSERT/UPDATE/DELETE for smoke.

| # | Check | Pass criteria | ☐ |
|---|-------|---------------|---|
| DB1 | Identity | `platform.database_identity` → `blessboard-platform-v5` / expected env | ☐ |
| DB2 | Forbidden legacy | `public.tenants` and `public.session` absent | ☐ |
| DB3 | Org | `diagnostic-church` active | ☐ |
| DB4 | Enrolment | BlessBoard product enrolment active | ☐ |
| DB5 | Church + HQ/primary | `diagnostic-church` / `hq` active; `is_primary` true | ☐ |
| DB6 | Domain | `diagnostic.blessboard.org` active canonical | ☐ |
| DB7 | Deployment | `blessboard-org-v5` active | ☐ |
| DB8 | Roles | Active PA, HQ, BA role rows for test emails | ☐ |
| DB9 | Member | Active member + primary membership on `hq` | ☐ |
| DB10 | Content | Published `home` + `about` in `blessboard.public_pages` (or accepted empty with ticket) | ☐ |
| DB11 | Samples | ≥1 safe row in modules you will click (optional per module) | ☐ |

---

## 5. Security checklist

| # | Check | ☐ |
|---|-------|---|
| S1 | CSRF present on all state-changing forms tested | ☐ |
| S2 | CSRF missing → 403 / safe JSON `reason` (media) | ☐ |
| S3 | Session cookie host-only; not parent-domain shared | ☐ |
| S4 | Transfer `tr` opaque; not raw secrets in HTML | ☐ |
| S5 | No open redirect on `next` (only allowlisted paths) | ☐ |
| S6 | Role isolation 403 matrix (T14) | ☐ |
| S7 | No secret leakage (T18) | ☐ |
| S8 | Media: SVG rejected; private not public | ☐ |
| S9 | Audit/admin pages redact tokens/connection strings | ☐ |
| S10 | Unknown host controlled 404/503 (not stack) | ☐ |

---

## 6. Post-deployment smoke checklist

Run immediately after Hostinger restart / routing change.

| Step | Action | Expect | ☐ |
|------|--------|--------|---|
| P1 | `GET /healthz` on Apex | **200** ok V5 mode string | ☐ |
| P2 | Apex `/` + `/login` | **200** | ☐ |
| P3 | Confirm routing mode env | matches intended (`shadow` then later `authoritative`) | ☐ |
| P4 | Shadow (if applicable): Tenant `/` | **200** foundation; log `blessboard_tenant_route_shadow` | ☐ |
| P5 | Authoritative: Tenant `/` | **200** tenant shell | ☐ |
| P6 | One PA login + `/admin` | **200** | ☐ |
| P7 | One HQ transfer → `/hq` | **200** | ☐ |
| P8 | One BA transfer → `/branch-admin` | **200** | ☐ |
| P9 | One MEM → `/member` | **200** | ☐ |
| P10 | Logout all personas | sessions cleared | ☐ |
| P11 | Capture evidence pack | screenshots + HAR notes + mode timestamp | ☐ |
| P12 | Go / Hold / Rollback decision | recorded below | ☐ |

**Decision:** ☐ Go · ☐ Hold · ☐ Rollback  

**Routing rollback (if needed):**

```bash
# Hostinger env + restart
BLESSBOARD_TENANT_ROUTING_MODE=off
```

Then re-check Apex `/healthz` and `/login`.

---

## 7. Evidence pack (minimum)

| Artifact | Required |
|----------|----------|
| Desktop screenshots: Apex home, Tenant home, one portal per role | Yes |
| Mobile screenshots: Apex drawer, Tenant home, one admin shell | Yes |
| Cookie attribute shot (host-only) | Yes |
| One CSRF failure proof | Yes |
| One 403 wrong-role proof | Yes |
| Media upload success + SVG reject | If T17 run |
| DB verify notes (keys only, no secrets) | Yes |
| Routing mode + timestamp | Yes |

---

## 8. Suggested run order (same day)

1. DB verification checklist (DB1–DB11)  
2. Security spot env (S3, T20)  
3. Post-deploy P1–P5  
4. T01 → T06 (apex + auth transfer)  
5. T07 → T09 (registration → member)  
6. T10 → T12 (BA → HQ → PA)  
7. T13 → T14 (logout + authz)  
8. T16 → T19 (mobile, media, secrets, links)  
9. T15 only if safe inactive fixture exists  
10. Sign-off (section 6)

---

## 9. Plan execution verdict

| Item | Status |
|------|--------|
| Plan document complete (journeys 1–20 + checklists) | **Ready** |
| Executable against current hosted demo tenant **without** further setup | **Not yet** — close gaps in [`V5_DEMO_TENANT_READINESS.md`](./V5_DEMO_TENANT_READINESS.md) first |
| Executable after users + published content + authoritative routing | **Yes** |

**Bottom line:** The smoke-test **plan is ready to execute** as an operator runbook. Do not start the full authoritative journey until demo-tenant readiness reports users, Home/About, and (for module clicks) sample rows as READY.
