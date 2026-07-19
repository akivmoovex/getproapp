# BlessBoard V5 — Demo minimum dataset

**Date:** 2026-07-19  
**Mode:** Documentation only — **do not create or seed data** from this file  
**Companions:** [`V5_DEMO_E2E_SMOKE_TEST.md`](./V5_DEMO_E2E_SMOKE_TEST.md) · [`V5_DEMO_TENANT_REMEDIATION_PLAN.md`](./V5_DEMO_TENANT_REMEDIATION_PLAN.md) · [`V5_DEMO_SEED_TOOLING_AUDIT.md`](./V5_DEMO_SEED_TOOLING_AUDIT.md)

**Purpose:** Smallest record set that demonstrates every **implemented** V5 area without padded or boastful fake content.

**Tenant target (keys):** `diagnostic-church` / branch `hq` / host `diagnostic.blessboard.org`  
**Content tone:** Fictional, neutral, clearly **demo/testing**. No real people, no large attendance/revenue/impact claims.

**Relative dates:** `D0` = calendar day of smoke execution (tenant timezone, prefer `UTC` or branch TZ `UTC` for demos).

---

## 0. Privacy & content safeguards

| Rule | Practice |
|------|----------|
| No real PII | Use only fictional names; emails like `demo.member+smoke@example.test` (operator-owned disposable only) |
| No real passwords in docs | Document placeholders only; never commit secrets |
| Mark demo | Titles/summaries include `[Demo]` or “Testing congregation” wording |
| No vanity metrics | Attendance counts ≤ **12**; giving amounts ≤ **USD 25.00**; no “thousands of members” copy |
| No fabricated claims | No revival stats, fundraising goals hit, or growth percentages |
| Scope | Prefer **church-wide** or **hq** only; do not invent a second campus unless T22 needs it |
| Legacy directory | Apex `/directory` still queries V4 `public.church_*` — **do not** create those tables/rows on V5 to “fill” the directory |
| Media | Prefer one small public JPEG + one private PDF; soft-archive after smoke when disposable |

---

## 1. Catalogue & persona prerequisites (not CMS, but required)

These are identity/provisioning records (see remediation plan). Counted separately from CMS/ops rows.

| Record type | Min qty | Required fields (conceptual) | Status | Ownership scope | Publication | Dates | Media | Cleanup |
|-------------|---------|------------------------------|--------|-----------------|-------------|-------|-------|---------|
| Platform org + BlessBoard enrolment + domain | 1 set | Keys `diagnostic-church`; host `diagnostic.blessboard.org`; deployment `blessboard-org-v5`; env `testing` | `active` | Platform | N/A | Existing | None | Do not delete shared demo without approval |
| Church + HQ/primary branch `hq` | 1 set | Matching keys; `hq` primary | `active` | Org/church | N/A | Existing | None | Same |
| Users + roles PA / HQ / BA | 3 users + 3 role grants | Emails disposable; roles as smoke personas | `active` | Org / church / `hq` | N/A | Existing | None | Prefer leave; no revoke CLI |
| Member user + primary membership | 1 | Linked user; primary membership on `hq` | Member `active`; membership `active` | `hq` | N/A | Created during T11–T13 | None | Keep for T14; document email key only |

**Optional negatives (Skip if missing):** inactive user; second branch for wrong-branch BA — **not** in minimum set.

---

## 2. Minimum content & operational records

Unless noted, scope = church `diagnostic-church`, branch `hq` (or church-wide `branch_id` null where product allows).

### 2.1 Apex directory listing

| Field | Value |
|-------|-------|
| **Minimum quantity** | **0** V5-native directory rows |
| **Required fields** | N/A — V5 foundation must not invent `public.church_organizations` / `public.church_branches` for directory fill |
| **Status** | Apex page itself **200**; results may be empty or “unavailable” |
| **Ownership scope** | Apex marketing |
| **Publication state** | N/A |
| **Dates** | N/A |
| **Media** | None |
| **Cleanup** | None |
| **Demo note** | T04 validates chrome/search honesty, not a filled directory |

### 2.2 Tenant Home

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** `public_pages` row `page_key=home` + **1** published section (hero or body) |
| **Required fields** | `page_key=home`, `title` e.g. “Welcome — [Demo] Testing Congregation”, ≥1 section with short neutral copy |
| **Status** | Page + section `published` |
| **Ownership scope** | Church-wide or `hq` (match how admin creates it) |
| **Publication state** | Published |
| **Dates** | `published_at` ≤ D0 |
| **Media** | Optional; none required |
| **Cleanup** | Unpublish or leave for shared demo |

### 2.3 About

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** page `about` + **1** published section |
| **Required fields** | Title “About — [Demo]”; 2–4 short sentences; no impact claims |
| **Status** | `published` |
| **Ownership scope** | Church / `hq` |
| **Publication state** | Published |
| **Dates** | `published_at` ≤ D0 |
| **Media** | None |
| **Cleanup** | Unpublish or leave |

### 2.4 Leadership

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** published page `leadership` (may be empty chrome) **+ 1** `leaders` row |
| **Required fields** | Leader: `display_name` e.g. “Alex Rivera (Demo)”; `role_title` e.g. “Pastor (Demo)”; short bio optional |
| **Status** | Page `published`; leader `published` |
| **Ownership scope** | Church / `hq` |
| **Publication state** | Published |
| **Dates** | N/A |
| **Media** | None (no portrait required) |
| **Cleanup** | Soft-unpublish leader or leave |

### 2.5 Ministries (public + member)

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** page `ministries` + **1** ministry |
| **Required fields** | `name` “[Demo] Welcome Team”; `summary` one line; `join_policy=request` (default-friendly); no contact email of a real person |
| **Status** | Page + ministry `published` |
| **Ownership scope** | Prefer `hq` (branch-scoped) so BA and member both see it |
| **Publication state** | Published |
| **Dates** | N/A |
| **Media** | None |
| **Cleanup** | Unpublish or leave |

### 2.6 Events (public + member)

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** page `events` + **1** upcoming event |
| **Required fields** | `title` “[Demo] Midweek Gathering”; `starts_at` = **D0 + 3 days** ~18:00; `timezone` e.g. `UTC`; `summary` one line; no capacity or capacity ≤ 20 |
| **Status** | Page + event `published` |
| **Ownership scope** | `hq` |
| **Publication state** | Published |
| **Dates** | Start in the **future** relative to D0 (public list omits past) |
| **Media** | None |
| **Cleanup** | Cancel/unpublish after smoke or leave for next run (update date if reused) |

### 2.7 Sermons

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** page `sermons` + **1** sermon |
| **Required fields** | `title` “[Demo] Introduction”; `preached_on` or equivalent date = **D0 − 7 days**; short description |
| **Status** | Page + sermon `published` |
| **Ownership scope** | Church / `hq` |
| **Publication state** | Published |
| **Dates** | Recent past (≤ 30 days) |
| **Media** | None (no audio/video required) |
| **Cleanup** | Unpublish or leave |

### 2.8 Contact

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** page `contact` + **1** contact channel |
| **Required fields** | Channel label e.g. “General (Demo)”; value = fictional `demo.contact@example.test` or generic “Use the public form”; no real phone |
| **Status** | Page + channel `published`/`active` as product requires |
| **Ownership scope** | Church / `hq` |
| **Publication state** | Published |
| **Dates** | N/A |
| **Media** | None |
| **Cleanup** | Leave or deactivate channel |

### 2.9 Giving (public instructional)

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** page `giving` + **1** giving method |
| **Required fields** | Method title “[Demo] Bank transfer info”; instructional text only — **no** live processor, QR checkout, or real bank numbers (use clearly fake “DEMO-00-0000”) |
| **Status** | Page + method published/active |
| **Ownership scope** | Church / `hq` |
| **Publication state** | Published |
| **Dates** | N/A |
| **Media** | None |
| **Cleanup** | Leave |

### 2.10 Member registration

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** registration during smoke (creates pending → approved member) |
| **Required fields** | Product registration fields; disposable email; fictional display name “[Demo] Jordan Lee” |
| **Status** | Pending then `active` member |
| **Ownership scope** | `hq` |
| **Publication state** | N/A |
| **Dates** | Submitted on D0 |
| **Media** | None |
| **Cleanup** | Keep approved member for portal smoke; do not invent DELETE SQL |

### 2.11 Member dashboard

| Field | Value |
|-------|-------|
| **Minimum quantity** | **0** extra rows — uses active MEM + published announcement/event/ministry above |
| **Required fields** | N/A |
| **Status** | N/A |
| **Ownership scope** | Member on `hq` |
| **Publication state** | N/A |
| **Dates** | N/A |
| **Media** | None |
| **Cleanup** | None |

### 2.12 Announcements (admin + member)

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** announcement |
| **Required fields** | `title` “[Demo] This week”; short body; audience includes `members`; branch `hq` or church-wide as HQ |
| **Status** | `published` |
| **Ownership scope** | Prefer `hq` for BA visibility |
| **Publication state** | Published (confirm publish if product requires) |
| **Dates** | Published on D0 (or ≤ D0) |
| **Media** | Optional none; if attach, use public demo image from §2.20 |
| **Cleanup** | Archive via UI after smoke if disposable |

### 2.13 Member events and ministries participation

| Field | Value |
|-------|-------|
| **Minimum quantity** | Reuse **1** ministry + **1** event from §§2.5–2.6; optional **1** join request or event registration if exercising those actions |
| **Required fields** | For optional join: request status pending/approved as product allows — keep fictional |
| **Status** | Published entities; membership/registration as created |
| **Ownership scope** | `hq` + MEM |
| **Publication state** | Entities published |
| **Dates** | Event still upcoming |
| **Media** | None |
| **Cleanup** | Cancel registration / leave request via UI |

### 2.14 Resources

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** resource |
| **Required fields** | `title` “[Demo] Welcome leaflet”; audience `members`; optional link to private media PDF |
| **Status** | `published` |
| **Ownership scope** | `hq` |
| **Publication state** | Published |
| **Dates** | D0 |
| **Media** | Optional private PDF (§2.20) |
| **Cleanup** | Unpublish / soft-archive attachment |

### 2.15 Forms

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** form with **≥1** field (e.g. short text “Notes”) |
| **Required fields** | Title “[Demo] Feedback”; schema with one safe field; audience members |
| **Status** | `published` |
| **Ownership scope** | `hq` |
| **Publication state** | Published |
| **Dates** | D0 |
| **Media** | None |
| **Cleanup** | Archive form; leave submissions |

### 2.16 Requests

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** member request (created by MEM) |
| **Required fields** | Product request type/title; short body; no sensitive pastoral detail beyond demo placeholder |
| **Status** | `open` or equivalent |
| **Ownership scope** | MEM owns; BA/HQ review in branch/church scope |
| **Publication state** | N/A (private workflow) |
| **Dates** | D0 |
| **Media** | Optional none |
| **Cleanup** | Close/resolve via UI |

### 2.17 Attendance

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** attendance event + **1** category count entry |
| **Required fields** | Title “[Demo] Sunday service”; `event_type` e.g. `sunday_service`; `event_date` = **D0 − 1 day**; one category e.g. `adults` with count **8** (small) |
| **Status** | Prefer `submitted` or `approved` so HQ reports show a real aggregate — not empty-only |
| **Ownership scope** | `hq` |
| **Publication state** | N/A (ops workflow) |
| **Dates** | Event date in current month for HQ month filter |
| **Media** | None |
| **Cleanup** | Archive event via UI if disposable |

### 2.18 Giving summaries (manual ledger)

| Field | Value |
|-------|-------|
| **Minimum quantity** | **1** active giving category (if required by product) + **1** giving entry |
| **Required fields** | Amount **`12.50`** (string decimal); currency `USD`; `giving_date` = **D0 − 2 days**; category demo; notes “[Demo] cash count — fictional” — **no donor PII columns** |
| **Status** | Prefer `approved` so monthly summary non-zero |
| **Ownership scope** | `hq` |
| **Publication state** | N/A |
| **Dates** | Same month as smoke for HQ giving report |
| **Media** | None |
| **Cleanup** | Void via UI if product supports; else leave labeled demo |

### 2.19 Branch administration / HQ reports / platform administration

| Field | Value |
|-------|-------|
| **Minimum quantity** | **0** extra content rows — shells use catalogue + personas + rows above |
| **Required fields** | PA sees `diagnostic-church`; HQ reports need attendance/giving samples in month; BA needs registrations/content modules |
| **Status** | N/A |
| **Ownership scope** | Role-appropriate |
| **Publication state** | N/A |
| **Dates** | Report month = month containing D0 |
| **Media** | None beyond §2.20 |
| **Cleanup** | None |

### 2.20 Media picker / upload

| Field | Value |
|-------|-------|
| **Minimum quantity** | **2** assets: (A) public JPEG/PNG ≤200KB “[Demo] campus photo”; (B) private PDF ≤100KB “[Demo] internal leaflet” |
| **Required fields** | Allowlisted type/size; church-scoped library; CSRF on upload |
| **Status** | Active (not archived) during T18–T19 |
| **Ownership scope** | Church media library |
| **Publication state** | Visibility `public` + `private` respectively |
| **Dates** | Uploaded on D0 |
| **Media** | Self |
| **Cleanup** | Soft-archive both after smoke if disposable; never hard-delete SQL |

---

## 3. Quantity rollup (content / ops only)

Excludes catalogue/persona rows from §1.

| # | Record type | Min qty |
|---|-------------|---------|
| 1 | Apex directory V5 rows | 0 |
| 2 | Home page (+ section) | 1 (+1) |
| 3 | About page (+ section) | 1 (+1) |
| 4 | Leadership page + leader | 1 + 1 |
| 5 | Ministries page + ministry | 1 + 1 |
| 6 | Events page + event | 1 + 1 |
| 7 | Sermons page + sermon | 1 + 1 |
| 8 | Contact page + channel | 1 + 1 |
| 9 | Giving page + method | 1 + 1 |
| 10 | Announcement | 1 |
| 11 | Resource | 1 |
| 12 | Form | 1 |
| 13 | Member request | 1 |
| 14 | Attendance event (+ count) | 1 (+1) |
| 15 | Giving category (if needed) + entry | 0–1 + 1 |
| 16 | Media assets | 2 |
| 17 | Registration/member (smoke-created) | 1 flow |

**Approximate total minimum durable content/ops records:** ~**22–24** rows/entities (pages, sections, entities, ops, media), plus **1** registration→member flow created during smoke.

**Plus prerequisites:** 1 catalogue set + 3 staff users/roles + 1 member (after approval).

---

## 4. Time-sensitive records

| Record | Relative timing | If smoke slips |
|--------|-----------------|----------------|
| Public event | `starts_at` ≥ **D0 + 1 day** (prefer +3) | Edit start forward before T06/T14 |
| Sermon date | **D0 − 7** (± few days OK) | Leave or nudge within 30 days |
| Attendance event date | **D0 − 1**, same calendar month as HQ report filter | Recreate in current month |
| Giving entry date | **D0 − 2**, same month | Same |
| Announcement | Published ≤ D0 | Re-publish if archived |
| Media | Uploaded on run day | Soft-archive after |

---

## 5. Media requirements (summary)

| Need | Spec |
|------|------|
| Required for T18–T19 | 1 public image + 1 private PDF (or create during test) |
| Optional elsewhere | Announcement/resource may attach the public/private assets |
| Forbidden | SVG upload, stock Unsplash search, real personal photos, storage keys in copy |
| Cleanup | Soft-archive disposable assets via UI |

---

## 6. Smoke-test → records matrix

| Smoke | Needs from this dataset |
|-------|-------------------------|
| T01–T03, T05 | None (apex marketing static) |
| T04 Directory | **0** V5 rows; accept empty/unavailable |
| T06 Home | Home published |
| T07 Nav | Home + About (+ Leadership/Ministries/Events/Sermons/Contact/Giving pages published so links are not dead) |
| T08–T10 Auth | Personas PA/HQ/BA/MEM |
| T11–T13 Registration | BA persona; creates registration/member |
| T14 Member portal | MEM + announcement + event + ministry (+ resource/form if clicking those) |
| T15 Branch admin | BA + samples for modules clicked (announcement, attendance, giving, forms, requests, content, media) |
| T16 HQ admin | HQ + attendance/giving samples in month + audit generates from real actions |
| T17 Platform admin | PA + catalogue org |
| T18–T19 Media | Media assets (or create during test) |
| T20 Logout | Any persona sessions |
| T21 Wrong-role | All four personas |
| T22–T26 Negatives | Optional fixtures — **not** in minimum set → Skip |
| T27 CSRF | Authenticated session only |
| T28 Mobile | Same as desktop shells exercised |
| T29–T30 Secrets/links | Published pages + portals |
| T31 Legacy DB | Catalogue only; **no** `public.tenants` |

---

## 7. Suggested commit message

```
docs(testing): define V5 demo minimum content dataset

Specify the smallest neutral demo records per V5 area and map them to smoke tests without seeding data.
```
