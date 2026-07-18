# BlessBoard V5 GUI — production smoke-test checklist

**Date:** 2026-07-18  
**Purpose:** Manual verification after a supervised V5 production (or staging) cutover.  
**Constraint:** This document does **not** authorize deploy. Run only after operators complete migrate/provision/routing gates.

**Related:** [`V5_FINAL_STITCH_PARITY.md`](./V5_FINAL_STITCH_PARITY.md) · [`V5_IMPLEMENTATION_AND_STITCH_RECONCILIATION.md`](../database/V5_IMPLEMENTATION_AND_STITCH_RECONCILIATION.md)

---

## 0. Preconditions (do not smoke until green)

| # | Gate | Pass criteria |
|---|------|---------------|
| P1 | Hosted DB identity | `DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5`; `db:identity:check` OK |
| P2 | Migrations | Platform through **013**, BlessBoard through **025**; `db:verify:foundation` green |
| P3 | App health | `GET https://blessboard.org/healthz` → `{"ok":true,"mode":"v5-foundation"}` (or agreed prod mode string) |
| P4 | Env | `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` only after shadow sign-off; `SESSION_COOKIE_NAME` host-only; no `GETPRO_DATABASE_URL` |
| P5 | Provisioned demo tenant | At least one `{org}.blessboard.org` with church + primary branch + published sample content |
| P6 | Test users | `platform_admin` (apex); `church_hq_admin`; `branch_admin`; active **member** with membership on primary branch |
| P7 | Media | Public/private buckets configured if content/forms attachments will be exercised |
| P8 | Browser | One desktop (≥1280px) + one mobile (≤390px or device); private/incognito windows per role |

**Hosts used in this checklist**

| Alias | Example | Used for |
|-------|---------|----------|
| **Apex** | `https://blessboard.org` | Marketing home, login, account, platform admin |
| **Tenant** | `https://{org}.blessboard.org` | Public CMS, register, portals |

Replace `{org}` with the provisioned smoke-test organization key.

---

## 1. Exact recommended deployment and manual verification order

> Operators deploy; this list is the **order**. Smoke starts only at step **M1**.

### Deployment sequence (operators)

1. Confirm V5 Supabase ≠ V4; migrate + identity + foundation verify.  
2. Create storage buckets if missing.  
3. Deploy/pull intended `V5` tip to Hostinger; set env; **restart all workers**.  
4. Verify `/healthz` on apex.  
5. Keep `BLESSBOARD_TENANT_ROUTING_MODE=off` → smoke **Apex-only** rows (A1–A5, PA*).  
6. Provision org/church/branch/users/domains.  
7. Switch to `shadow` → confirm logs on tenant host (HTML still safe/foundation as designed).  
8. Switch to `authoritative` + restart → begin full smoke below.  
9. On any **rollback trigger**, set `BLESSBOARD_TENANT_ROUTING_MODE=off`, restart, re-check apex `/healthz` and `/login`.

### Manual verification order (smoke)

| Step | Scope | Why this order |
|------|--------|----------------|
| **M1** | Apex home + login + account + logout | Auth must work before any portal |
| **M2** | Platform admin (read paths) | Confirms org directory without tenant routing dependency beyond session |
| **M3** | Tenant public pages + mobile menu | CMS/hostname resolution before portals |
| **M4** | Tenant registration + tenant `/login` transfer | Onboarding + apex transfer |
| **M5** | Member portal (all modules) | Member session on tenant host |
| **M6** | Branch admin (all modules) | Branch-scoped writes after public OK |
| **M7** | HQ dashboard + branch selector | Cross-branch jump |
| **M8** | HQ oversight modules | Announcements / attendance / giving / registrations / members as mounted |
| **M9** | HQ reports + audit | Read-only aggregates last |
| **M10** | Negative checks | Wrong-role 403, unknown host 404, no UUID leak, CSRF reject |
| **M11** | Sign-off | Capture evidence pack; decide go / hold / rollback |

**Do not** invite real church staff until **M1–M10** pass for the target environment.

---

## 2. How to use each row

| Column | Meaning |
|--------|---------|
| **Expected status** | HTTP / UI outcome |
| **Expected role** | Who may pass |
| **Expected tenant** | Apex vs Tenant host |
| **Expected data state** | What must exist (or intentional empty) |
| **Desktop / Mobile** | Checkboxes for viewport |
| **Rollback trigger** | Immediate stop + routing/env rollback if seen |
| **Evidence** | What to save (screenshot / HAR / note) |

Mark each row: ☐ Pass · ☐ Fail · ☐ Skip (with reason).

---

## 3. Apex

### 3.1 Home

| Field | Value |
|-------|--------|
| Route | `GET /` on **Apex** |
| Expected status | **200**; Sacred Modernity apex home (hero + audience + capabilities + footer). Not blank 500. |
| Expected role | anon (and authenticated optional) |
| Expected tenant | Apex only |
| Expected data state | Static marketing copy; no fabricated org metrics |
| Desktop check | ☐ Hero readable; Home/Login (or Account) nav; footer Powered by GetPro |
| Mobile check | ☐ Drawer opens/closes; Escape restores focus; no horizontal scroll |
| Rollback trigger | 5xx on `/`; wrong product shell (V4/GetPro); missing assets 404 storm |
| Evidence | Desktop + mobile screenshots of first viewport; View Source note of CSS `?v=` |

### 3.2 Login

| Field | Value |
|-------|--------|
| Route | `GET/POST /login` on **Apex** |
| Expected status | **200** form; bad password → controlled error (no stack); good password → **303** to `/` or `next` |
| Expected role | anon → session user |
| Expected tenant | Apex |
| Expected data state | Valid platform user in DB; CSRF token present |
| Desktop check | ☐ Dual-pane login; skip link; no forgot-password link required |
| Mobile check | ☐ Form usable; keyboard does not clip primary button |
| Rollback trigger | Login 5xx; session cookie set on `.blessboard.org` parent domain; raw transfer tokens in HTML |
| Evidence | Screenshot of login; DevTools Application → cookie host-only; failed-login screenshot |

### 3.3 Account

| Field | Value |
|-------|--------|
| Route | `GET /account` on **Apex** |
| Expected status | **200** when authenticated; unauth → login redirect |
| Expected role | Any authenticated apex session |
| Expected tenant | Apex |
| Expected data state | Display name only — **no** user/church UUIDs in HTML |
| Desktop check | ☐ Account card; Logout control present |
| Mobile check | ☐ Same content readable |
| Rollback trigger | UUID/session token visible in HTML; 5xx |
| Evidence | HTML search for UUID pattern (none); screenshot |

### 3.4 Logout

| Field | Value |
|-------|--------|
| Route | `POST /logout` (or shell logout) on **Apex** |
| Expected status | Missing CSRF → **403**; valid CSRF → **303**; subsequent `/account` requires login |
| Expected role | Authenticated |
| Expected tenant | Apex |
| Expected data state | Session destroyed |
| Desktop check | ☐ Logout works once |
| Mobile check | ☐ Same |
| Rollback trigger | Logout without CSRF succeeds; session survives logout |
| Evidence | Network log of 403 then 303; cookie cleared |

### 3.5 Platform admin

| # | Route | Expected status | Expected role | Expected tenant | Expected data state | Desktop | Mobile | Rollback trigger | Evidence |
|---|-------|-----------------|---------------|-----------------|---------------------|---------|--------|------------------|----------|
| PA1 | `GET /admin` | **200** summary with **live** org counts only | `platform_admin` | Apex | ≥0 orgs; no fake MRR/health/tickets | ☐ | ☐ | Fabricated metrics; non-admin **200** | Screenshot + HTML grep no UUID |
| PA2 | `GET /admin/organizations` | **200** paginated directory | `platform_admin` | Apex | Provisioned orgs listed | ☐ | ☐ | Cross-tenant leak; HQ/branch gets **200** | List screenshot |
| PA3 | `GET /admin/organizations/{key}` | **200** detail + entitlements/domains | `platform_admin` | Apex | Known smoke org | ☐ | ☐ | Plan assign without confirm | Detail screenshot |
| PA4 | `GET /admin/plans` | **200** catalogue | `platform_admin` | Apex | Plans rows; **no** billing checkout | ☐ | ☐ | Payment UI appears | Screenshot |
| PA5 | `GET /admin/deployments` | **200** registry | `platform_admin` | Apex | Deployment rows; no fake uptime | ☐ | ☐ | Ticket queue / fake health | Screenshot |
| PA6 | `GET /admin/settings` | **200** read-only DNS patterns | `platform_admin` | Apex | Patterns display; no destructive save | ☐ | ☐ | Writable DNS/failover UI | Screenshot |
| PA7 | Negative | `/admin` as HQ/branch/member → **403**; tenant host `/admin` → **503**/reject | wrong role / Tenant | — | — | ☐ | ☐ | Wrong-role access | Status codes noted |

---

## 4. Tenant public

**Host:** **Tenant** · **Role:** anon (unless noted) · **Routing:** `authoritative`

### 4.1 All public pages

| # | Route | Expected status | Expected data state | Desktop | Mobile | Rollback trigger | Evidence |
|---|-------|-----------------|---------------------|---------|--------|------------------|----------|
| T1 | `/` | **200** CMS home | Published hero/sections **or** intentional empty | ☐ | ☐ | 5xx; apex marketing chrome on tenant; demo member counts | First-viewport shots D+M |
| T2 | `/about` | **200** | Published sections or empty | ☐ | ☐ | Draft content visible | Screenshot |
| T3 | `/leadership` | **200** | Published leaders or empty | ☐ | ☐ | Placeholder people / stock bios | Screenshot |
| T4 | `/ministries` | **200** | Published ministries or empty | ☐ | ☐ | Fabricated schedules | Screenshot |
| T5 | `/events` | **200** **list** (not calendar) | Published events or empty | ☐ | ☐ | Calendar-only UI required for pass | Screenshot |
| T6 | `/sermons` | **200** | Published sermons or empty | ☐ | ☐ | Broken media links storm | Screenshot |
| T7 | `/giving` | **200** info methods | Published methods; **no** pay form | ☐ | ☐ | Payment collection UI | Screenshot |
| T8 | `/contact` | **200** + optional form | Channels; map only if lat/lng | ☐ | ☐ | Form 5xx; XSS of submitted text | Submit + screenshot |
| T9 | Unknown host | controlled **404** | Unprovisioned slug | ☐ | — | **500** on unknown host | Status + body note |
| T10 | Suspended site | **503**/unavailable | If smoke tenant can toggle | ☐ | — | Soft-fail to wrong church | Status note |

**Expected role:** anon · **Expected tenant:** Tenant host · **Church UUID in HTML:** none

### 4.2 Mobile menu

| Field | Value |
|-------|--------|
| Surface | Tenant public header drawer |
| Expected status | Open/close; links navigate; body scroll lock while open |
| Expected role | anon |
| Expected tenant | Tenant |
| Expected data state | Full public nav (Home, About, Leadership, Ministries, Events, Sermons, Giving, Contact, Register as configured) |
| Desktop check | ☐ Desktop nav links work (drawer may be hidden) |
| Mobile check | ☐ Hamburger; each link; Escape closes + focus restore; no trap after close |
| Rollback trigger | Drawer unusable; links 404; focus lost permanently |
| Evidence | Mobile screen recording or 3 screenshots (closed / open / after nav) |

### 4.3 Registration

| Field | Value |
|-------|--------|
| Routes | `GET/POST /register` → `GET /register/submitted` |
| Expected status | Form **200**; valid POST → **303** to submitted; submitted **200** |
| Expected role | anon |
| Expected tenant | Tenant |
| Expected data state | Registration row created pending verification; CSRF required |
| Desktop check | ☐ Fields validate; success page shows |
| Mobile check | ☐ Form usable on narrow viewport |
| Rollback trigger | POST without CSRF succeeds; registration creates active membership without approval; 5xx |
| Evidence | Success screenshot; DB or admin queue shows pending (via branch admin later) |

### 4.4 Tenant login

| Field | Value |
|-------|--------|
| Route | `GET /login` on **Tenant** |
| Expected status | **303** to Apex transfer/login — **never** a tenant password form |
| Expected role | anon |
| Expected tenant | Tenant → Apex |
| Expected data state | Auth transfer created; no password fields on tenant HTML |
| Desktop check | ☐ Redirect chain ends at apex `/login` (or completes transfer) |
| Mobile check | ☐ Same |
| Rollback trigger | Tenant renders password form; transfer token in URL/HTML after consume; cookie Domain=`.blessboard.org` |
| Evidence | Network waterfall; final URL; cookie attributes |

---

## 5. Member portal

**Host:** **Tenant** · **Role:** active `member` with membership on primary branch · **Unauth:** redirect to tenant `/login` → apex

| # | Route | Expected status | Expected data state | Desktop | Mobile | Rollback trigger | Evidence |
|---|-------|-----------------|---------------------|---------|--------|------------------|----------|
| ME1 | `/member` | **200** dashboard shell | Live cards only; **no** prayer module required | ☐ | ☐ | Admin-without-membership **200**; fake metrics | Screenshot shell |
| ME2 | `/member/profile` | **200**; POST save with CSRF | Editable low-risk fields only | ☐ | ☐ | Immutable fields changeable; CSRF skip | Before/after + 403 without CSRF |
| ME3 | `/member/announcements` | **200** | Published for member scope | ☐ | ☐ | Draft/other-church items | List shot |
| ME4 | `/member/events` | **200** list | Published events; register/cancel if capacity allows | ☐ | ☐ | Calendar-only; cross-tenant event | List + optional RSVP |
| ME5 | `/member/ministries` | **200** | Join/leave per ministry rules | ☐ | ☐ | Join inactive ministry | List shot |
| ME6 | `/member/resources` | **200** | Published resources | ☐ | ☐ | Private asset public leak | List shot |
| ME7 | `/member/forms` | **200** | Available forms | ☐ | ☐ | 5xx on empty | Screenshot |
| ME8 | `/member/requests` (+ `/new`) | **200**; create with CSRF | Status list; new request | ☐ | ☐ | Attachment on wrong visibility | Create + list |
| ME9 | `/member/giving` | **200** info-only | Methods; **no** payment | ☐ | ☐ | Checkout/card UI | Screenshot |
| ME10 | Mobile nav | Tabs/drawer | Implemented modules only | — | ☐ | Broken bottom tabs / focus trap | Mobile shell shot |
| ME11 | Negative | HQ/branch on `/member` | **403** | ☐ | — | Portal confusion | Status codes |
| ME12 | Logout | `POST /member/logout` | CSRF → **303** | ☐ | ☐ | Session persists | Network log |

**Church/member UUIDs in HTML:** none · **Evidence pack:** one zip of ME1–ME9 D+M or annotated PDF.

---

## 6. Branch admin

**Host:** **Tenant** · **Role:** `branch_admin` (or HQ/platform as allowed) · **Scope:** assigned branch only

| # | Route | Expected status | Expected data state | Desktop | Mobile | Rollback trigger | Evidence |
|---|-------|-----------------|---------------------|---------|--------|------------------|----------|
| BA1 | `/branch-admin` | **200** shell | Live pending/member counts only | ☐ | ☐ | Fabricated %/map/FAB required for “pass”; wrong-branch **200** | Dashboard shot |
| BA2 | `/branch-admin/registrations` | **200** queue | Pending from T registration; approve/reject CSRF | ☐ | ☐ | Approve without CSRF; cross-branch approve | Queue + detail |
| BA3 | `/branch-admin/members` (+ `/:id`) | **200** directory/detail | Branch members only | ☐ | ☐ | Other branch/church members listed | Directory shot |
| BA4 | `/branch-admin/announcements` | **200** list/create/preview/publish | Draft → publish; media picker OK | ☐ | ☐ | Publish without CSRF; other campus leak | Publish flow shots |
| BA5 | `/branch-admin/content` (+ pages/entities/media) | **200** editors | Draft/publish; media upload if buckets OK | ☐ | ☐ | Public serves draft; cross-church media | Content index shot |
| BA6 | `/branch-admin/attendance` | **200** list/create/submit | Draft → submit; counts ≥0 | ☐ | ☐ | Negative counts accepted; wrong branch | Event detail |
| BA7 | `/branch-admin/giving` | **200** manual summaries | Categories/entries; **no** gateway | ☐ | ☐ | Payment/QR invent | List shot |
| BA8 | Forms admin (if mounted under branch) | **200** | Branch forms | ☐ | ☐ | 5xx empty | Screenshot |
| BA9 | `/branch-admin/requests` (+ `/:id`) | **200** queue/detail | Workflow actions + CSRF | ☐ | ☐ | Private attachment public URL | Detail shot |
| BA10 | Mobile shell | Drawer/tabs | Escape + focus restore | — | ☐ | Unusable admin on phone | Mobile shell |
| BA11 | Negative | Other branch host/session | **403** | ☐ | — | Scope break | Status note |
| BA12 | Logout | `POST /branch-admin/logout` | CSRF; returns tenant login path | ☐ | ☐ | Apex cookie Domain shared | Network + cookie |

---

## 7. HQ

**Host:** **Tenant** (HQ church primary host) · **Role:** `church_hq_admin`

### 7.1 Dashboard

| Field | Value |
|-------|--------|
| Route | `GET /hq` |
| Expected status | **200**; active branch **count** from live data |
| Expected role | `church_hq_admin` (platform may be allowed per policy) |
| Expected tenant | Tenant of that church |
| Expected data state | No fabricated growth % / charts required |
| Desktop check | ☐ Shell + real count + links |
| Mobile check | ☐ Drawer usable |
| Rollback trigger | Fake analytics presented as live; branch_admin gets full HQ write access incorrectly |
| Evidence | Screenshot |

### 7.2 Branch selector

| Field | Value |
|-------|--------|
| Route | `/hq/branches` → open branch → `/branch-admin` (authorized) |
| Expected status | Registry **200**; jump **303/200** into branch admin for own church only |
| Expected role | HQ |
| Expected tenant | Same church |
| Expected data state | Active branches listed; inactive → controlled 404 |
| Desktop check | ☐ Selector links work |
| Mobile check | ☐ Same |
| Rollback trigger | Jump into another church’s branch; inactive branch served as live |
| Evidence | Network + branch-admin shell shot after jump |

### 7.3 Oversight modules

| # | Route | Expected status | Expected data state | Desktop | Mobile | Rollback trigger | Evidence |
|---|-------|-----------------|---------------------|---------|--------|------------------|----------|
| HQ1 | `/hq/announcements` (+ branch scope) | **200** | Church-wide + branch-scoped publish | ☐ | ☐ | Cross-church publish | List/publish |
| HQ2 | `/hq/attendance` (+ `/b/:branchKey`) | **200** | Approve/archive as designed | ☐ | ☐ | Approve other church | List |
| HQ3 | `/hq/giving` (+ branch scope) | **200** | Manual only | ☐ | ☐ | Gateway UI | List |
| HQ4 | `/hq/registrations` / `/hq/members` | **200** | Church-scoped | ☐ | ☐ | Other church rows | Directory |
| HQ5 | `/hq/participation` (if linked) | **200** | Privacy-limited | ☐ | ☐ | PII dump | Screenshot |

### 7.4 Reports

| Field | Value |
|-------|--------|
| Routes | `/hq/reports`, `/hq/reports/attendance`, `/hq/reports/giving` |
| Expected status | **200**; month/branch filters; **tables/totals from live submitted data** |
| Expected role | HQ |
| Expected tenant | Tenant |
| Expected data state | No projected figures; empty month OK |
| Desktop check | ☐ Filters apply; numbers match known smoke entries |
| Mobile check | ☐ Tables scroll; no clipped primary actions |
| Rollback trigger | Invented charts/metrics; write endpoints on reports |
| Evidence | Filtered report screenshots + note of expected totals |

### 7.5 Audit

| Field | Value |
|-------|--------|
| Route | `GET /hq/audit` |
| Expected status | **200** read-only event list |
| Expected role | HQ |
| Expected tenant | Tenant |
| Expected data state | Recent smoke actions may appear; no edit controls |
| Desktop check | ☐ List renders |
| Mobile check | ☐ Readable |
| Rollback trigger | Audit mutations; cross-church events |
| Evidence | Screenshot |

---

## 8. Global negative & security checks (M10)

| # | Check | Expected | Rollback trigger | Evidence |
|---|-------|----------|------------------|----------|
| N1 | Church/org/member UUIDs absent from HTML on public + portals | No UUID patterns | Any UUID in HTML | `grep`/DevTools note |
| N2 | CSRF on all state-changing POSTs | **403** without token | CSRF bypass | Network HAR |
| N3 | Session cookie | Host-only; not `Domain=.blessboard.org` | Parent-domain cookie | Application panel |
| N4 | Apex `/admin*` on tenant host | Rejected | Tenant serves platform admin | Status |
| N5 | `/member` without membership | **403** | Privilege escalation | Status |
| N6 | Media private asset via public URL | **403** | Private leak | Status |
| N7 | Console | No uncaught exceptions on happy paths | Persistent JS errors blocking nav | Console export |

---

## 9. Rollback triggers (summary)

**Immediate rollback** (`BLESSBOARD_TENANT_ROUTING_MODE=off` + worker restart; consider DNS revert only if apex itself is broken):

1. Apex `/` or `/login` **5xx** or auth completely broken.  
2. Tenant host serves **wrong church** content.  
3. Session cookie scoped to parent domain / cross-subdomain session bleed.  
4. Any role bypass (member sees admin, branch sees other branch/church).  
5. Private media or attachment publicly readable.  
6. Transfer/session **tokens** visible in HTML or logs of HTML responses.  
7. Sustained **5xx** rate on public CMS after authoritative switch.

**Hold (do not invite users; fix forward):** Stitch visual gaps, empty CMS, missing marketing `/features`, incomplete platform chrome — these are **not** automatic rollbacks if security and routing are correct.

---

## 10. Evidence pack (required for sign-off)

Collect into one folder / zip:

1. `/healthz` JSON response.  
2. Apex home + login + account (D+M).  
3. Tenant home + mobile menu open.  
4. Registration submitted + branch registration queue.  
5. Member dashboard + one write (profile or request).  
6. Branch attendance or announcement publish.  
7. HQ dashboard + branch jump + one report filter.  
8. Platform admin organizations list.  
9. Cookie screenshot (host-only).  
10. Notes for any **Skip** rows and environment (`DEPLOYMENT_ENV`, routing mode, git SHA).

---

## 11. Sign-off

| Item | Value |
|------|-------|
| Environment | ☐ staging · ☐ production |
| Git SHA / release | |
| Routing mode at test | ☐ off · ☐ shadow · ☐ authoritative |
| Smoke executor | |
| Date/time (UTC) | |
| M1–M10 result | ☐ Pass · ☐ Fail · ☐ Hold |
| Decision | ☐ Go · ☐ Hold · ☐ Rollback |
| Approver | |

---

*Checklist aligned to V5 routes/services as of 2026-07-18. Visual Stitch exactness is out of scope for smoke pass/fail — security, tenancy, CSRF, and live-data honesty are in scope.*
