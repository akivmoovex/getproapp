# PHASE2_091 — Live V35 Stitch parity verification

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 testing church website on Hostinger (`automated-test-church`) after V35 deploy  
**Prerequisite:** `PHASE2_090` verdict **DEPLOYED**; expected live `tenant-public.css?v=35`  
**Constraint:** Documentation / measurement only — **no runtime code, database, migration, or env changes**

**Live bases**

- Public: `https://blessboard.org/c/automated-test-church`
- Preview: `https://blessboard.org/hq/content/preview/{pageKey}`

**Stitch project:** `projects/17124191473876947591`  
**Canonical screen IDs:** `PHASE2_084` §1.1 (re-confirmed via MCP `get_screen` for home desktop `ead45db5…` and header `43d6d1cb…`)

**Capture method**

- Live HTML/CSS fetch + Playwright (Chrome) at **1280** (Stitch desktop pair), **1440**, **1024**, **768**, **430**, **390**
- Screenshots under `/tmp/bb091/screens/`; measurements `/tmp/bb091/measurements.json`
- Scoring system identical to `PHASE2_084` §5 (Structure · Typography · Spacing · Content · Image · Desktop · Mobile → Overall)

---

## Verdict

**CURRENT_WITH_GAPS**

Live Hostinger serves the 085–088 Stitch-parity revision: HTML links `tenant-public.css?v=35`, CSS body is **byte-identical** to local `V5` tip, home band / shell nowrap / hero `4 / 3` are live. Overall parity rises from **~64** (084/089 on `?v=31`) to **~77**. Remaining gaps are media wiring, blocked product widgets, and content polish — not stale assets or old renderer code.

| Check | Result |
|-------|--------|
| CSS `?v=35` loaded on all 8 public pages | **Yes** |
| Live CSS SHA = local tip | **Yes** (`d0f87452…`, 79722 bytes) |
| Old preview chrome (`bb-ca-preview-*`) on public | **Absent** |
| Desktop nav single row (`flex-wrap: nowrap`, 8 links) | **Yes** (084 P0 closed) |
| Brand not incorrectly truncated | **Yes** (full name readable; no `14rem` ellipsis rule) |
| Horizontal overflow at 390px | **None** (all pages) |
| Rich home composition | **Live** (`data-bb-home-band`, violet service card, digital resources) |
| Seeded sections visible | **Yes** |
| Internal pages use current Stitch layouts / markers | **Yes** (`populated-v2/v3/v4` stitch attrs) |
| Public = published only | **Yes** (no draft / preview banner) |
| Preview = draft + banner | **Auth-gated this pass** (401 unauthenticated); public side of separation confirmed; authenticated banner/draft last proven in `PHASE2_083` on shared shell |

---

## 0. Deployment evidence

| Field | Value |
|-------|--------|
| Local / `origin/V5` tip | `e38fb6b984f85dd94f7392d14ff2c0619aabf02a` (“Register new church”, 2026-07-24 20:07:16 +0300) |
| Hostinger `git rev-parse` | **Unavailable** (SSH closed; same constraint as 083/089) |
| Inferred deployed revision | **`e38fb6b…`** — live CSS SHA matches tip; `Last-Modified` `Fri, 24 Jul 2026 17:07:31 GMT` aligns with tip commit time (UTC) |
| Live CSS link | `tenant-public.css?v=35` |
| Live CSS bytes / SHA-256 | **79722** / `d0f87452d6af5d8c783e451beb906a4f166fdc33babf79267ab0191f70ee796e` |
| Companion assets in HTML | `tenant-public.js?v=7`, `design-tokens.css?v=6`, `design-system.css?v=6` |
| Prior live (089) | `?v=31`, 73155 bytes, SHA `73de40b9…` |

**Public HTTP:** all eight pages **200**.  
**Preview (unauthenticated):** all eight keys **401** (“Sign-in is required.”) — not legacy `bb-ca-preview-body` HTML.

---

## 1. Confirmation checklist

| # | Confirm | Live result |
|---|---------|-------------|
| 1 | CSS v35 loaded | **Pass** — every public page links `tenant-public.css?v=35` |
| 2 | No old preview chrome | **Pass** on public; preview unauth = sign-in wall (no `bb-ca-preview`) |
| 3 | Desktop nav one row | **Pass** — `navWrapRows=1`, `flex-wrap: nowrap` at 1280/1440/1024/768 |
| 4 | Brand not incorrectly truncated | **Pass** — “BlessBoard Automated Test Church” + Headquarters readable; `max-width: 14rem` ellipsis rule **gone** |
| 5 | No horizontal overflow at 390 | **Pass** — `scrollWidth === clientWidth` on all pages |
| 6 | Rich home composition live | **Pass** — hero + band (announce/ministries \| service card + resources) + teasers/CTAs |
| 7 | All seeded sections visible | **Pass** — home markers through members; internal pages populated |
| 8 | Internal pages current Stitch layouts | **Pass** — stitch attrs match 084 canonical families |
| 9 | Public = published only | **Pass** — no draft markers / preview banner on public |
| 10 | Preview = draft + banner | **Partial this pass** — 401 without session; shared renderer + banner last verified authenticated in 083; public isolation still holds |

Header sticky inner height measures **80px** (matches 085 / Stitch header intent). Outer `data-bb-header` box can read taller in automation; screenshots show the single-row 80px bar.

Desktop home `documentElement.scrollWidth` can exceed viewport by ~3px because the **off-canvas drawer** sits at `left: viewportWidth`; `body { overflow-x: clip }` prevents user-visible scroll. Not scored as a mobile overflow failure.

---

## 2. Page scores (0–100) — same system as PHASE2_084

| Page | Structure | Typography | Spacing | Content | Image | Desktop | Mobile | **Overall** | Δ vs 084 |
|------|-----------|------------|---------|---------|-------|---------|--------|-------------|----------|
| Shared shell (header/nav/footer) | 88 | 82 | 78 | 78 | 78 | **88** | 82 | **82** | +15 |
| Home | 86 | 78 | 80 | 72 | 78 | 84 | 80 | **80** | +19 |
| About | 78 | 80 | 76 | 70 | 74 | 78 | 76 | **76** | +13 |
| Leadership | 82 | 80 | 76 | 74 | 80 | 82 | 78 | **79** | +8 |
| Ministries | 84 | 80 | 78 | 76 | 80 | 84 | 78 | **80** | +7 |
| Events | 82 | 80 | 76 | 74 | **48** | 76 | 74 | **73** | +4 |
| Sermons | 80 | 78 | 76 | 72 | **44** | 74 | 72 | **71** | +5 |
| Contact | 78 | 80 | 76 | 68 | 62 | 76 | 74 | **73** | +13 |
| Giving | 80 | 78 | 76 | 74 | 55 | 78 | 76 | **74** | +9 |
| Preview (home) | 86* | 78 | 80 | 74† | 78 | 84 | 80 | **80**‡ | +18 |

\*Assumes shared public renderer (live public proves shell/home markers).  
†Draft visibility not re-logged this pass; 083 proved draft marker in preview only.  
‡Provisional — unauthenticated preview returned 401.

**Site overall (weighted mean of page overalls, shell counted once): ~77 / 100** (was ~64 on `?v=31`).

---

## 3. Surface notes vs exact Stitch IDs

| Surface | Stitch ID (084) | Live evidence |
|---------|-----------------|---------------|
| Header D | `43d6d1cb110240c8aa7e5989386ea63b` | Single-row nav; 80px inner; Register + Member Login |
| Header M / drawer | `2d430d9648cc404b88f7463e170aa3b5` | Burger + drawer opens (`aria-expanded=true`, 11 links); no bottom-tab/FAB (intentional) |
| Home D | `ead45db5be774baa9454412262096ffc` | `data-bb-stitch-home="refined-v2"`; band + violet service + resources; hero img `aspect-ratio: 4 / 3` |
| Home M | `89177588fbf8405dbebd5747c38e19ce` | Copy-first hero; service card first in band stack |
| About D/M | `44492f6a…` / `3f0b8a5c…` | `populated-v3`; story/mission/vision/values/join |
| Leadership D/M | `372faa60…` / `0f4e816f…` | `populated-v2`; portraits present |
| Ministries D/M | `f146cdcc…` / `d2fd7ecc…` | `populated-v4` |
| Events D/M | `6f618576…` / `f58c416c…` | `populated-v2`; featured + list; **media still `is-fallback`** |
| Sermons D/M | `4f4995dc…` / `96b380d4…` | `populated-v2`; **3× `is-fallback` thumbs** |
| Contact D/M | `ab93d842…` / `9cbad6aa…` | `populated-v2`; hours + channels + map; honest non-form CTA |
| Giving D/M | `59c8fded…` / `a0616f23…` | `populated-v2`; methods + `data-bb-giving-testing` notice |
| Footer | embodied in frames | 4-column Quick Links / Contact / Members + Powered by GetPro path |

Home H1 remains **“A Place for Growth & Community”** (CMS/demo seed), not the Stitch “Spiritual Growth…” phrasing — structure matches; copy soft-fill does not override non-empty CMS.

---

## 4. P0 / P1 gaps

### P0

**None remaining** of the 084 blocking items:

1. ~~Desktop nav wrap~~ — fixed live (`nowrap`, one row).  
2. ~~Brand `14rem` ellipsis~~ — fixed live.

### P1

1. **Events / sermons demo images** — featured + list cards still use `is-fallback` despite local JPEG inventory (seed wiring gap).  
2. **About chrome vs Stitch** — stats / impact / annual report still missing (fabricated KPIs **blocked**; remaining non-metric chrome soft).  
3. **Contact message form** — product **BLOCKED**; honest CTA present.  
4. **Listing page-hero density** — Leadership/Events/Sermons/Ministries still large empty gradient first viewport vs denser Stitch heroes.  
5. **Home hero microcopy** — still “Growth & Community” vs Stitch “Spiritual Growth…” (content, not CSS).

### BLOCKED (unchanged product rules)

Prayer POST · fabricated KPIs · contact POST · live payment checkout · calendar UI · Stitch bottom-tab/FAB · Inter vs Hanken Grotesk.

---

## 5. Mobile overflow result

| Width | Pages tested | User-visible horizontal overflow |
|-------|--------------|----------------------------------|
| **390** | All 8 public | **None** |
| 430 | All 8 | None |
| 768–1440 | All 8 | No user scroll (`overflow-x: clip`); off-canvas drawer may inflate `scrollWidth` in automation only |

**Mobile overflow result: PASS @ 390.**

---

## 6. Preview / public parity result

| Concern | Public | Preview (this pass) |
|---------|--------|---------------------|
| Renderer | Shared `data-bb-shell="tenant-public"` | 401 sign-in (no legacy chrome body) |
| CSS | `?v=35` | n/a unauthenticated |
| Preview banner | Absent | Not re-verified (auth required) |
| Draft-only marker | Absent | Not re-verified; **083** showed draft only in preview |
| Old `bb-ca-preview-*` | Absent | Absent from 401 response |

**Preview/public parity result:** Public published-only isolation **confirmed**. Authenticated preview banner + draft **not re-logged** here; continuity inferred from shared live public renderer + `PHASE2_083` authenticated evidence. Treat as **PASS on public side / PARTIAL on preview auth**.

---

## 7. Viewport matrix (home shell)

| Width | Nav rows | Brand truncated | Overflow (measured) | Header inner |
|-------|----------|-----------------|---------------------|--------------|
| 1280 (Stitch pair) | 1 | no | clip / drawer artifact | 80px |
| 1440 | 1 | no | clip / drawer artifact | 80px |
| 1024 | 1 | no | clip / drawer artifact | 80px |
| 768 | 1 | no | clip / drawer artifact | 80px |
| 430 | 1 (drawer mode) | no | **false** | — |
| 390 | 1 (drawer mode) | no | **false** | — |

---

## 8. Code change confirmation

This prompt created **documentation only** (`docs/phase2/PHASE2_091_LIVE_V35_PARITY_VERIFICATION.md`).  
No application code, CSS, templates, tests, database, or env files were modified.

---

## 9. Evidence locations

| Artifact | Path |
|----------|------|
| Measurements JSON | `/tmp/bb091/measurements.json` |
| Live HTML | `/tmp/bb091/live/*.html` |
| Live CSS | `/tmp/bb091/css/live-v35.css` |
| Screenshots | `/tmp/bb091/screens/` |
