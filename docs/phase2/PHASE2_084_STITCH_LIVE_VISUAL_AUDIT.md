# PHASE2_084 — Exact Stitch → live church website visual audit

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 tenant public website + HQ content preview (`automated-test-church` on `blessboard.org`)  
**Prerequisite:** `PHASE2_083` verdict **DEPLOYED_CURRENT** (confirmed)  
**Constraint:** No runtime code, database, migration, or env changes  
**Stitch project (MCP):** `projects/17124191473876947591` — GetPro Church Platform (`list_screens` live)

**Live bases**

- Public: `https://blessboard.org/c/automated-test-church`
- Preview: `https://blessboard.org/hq/content/preview/{pageKey}`

**Capture method**

- Stitch: MCP `list_screens` + `get_screen`; HTML + PNG downloaded for canonical IDs
- Live: Playwright (Chrome) at **1280** (desktop ≈ Stitch 2560@2x), **390**, **430**, **768**; public all pages; preview home D/M
- CSS on live: `tenant-public.css?v=31`

---

## Verdict summary

| Metric | Value |
|--------|-------|
| Overall live parity score | **64 / 100** |
| Highest page | Ministries **73** |
| Lowest page | Contact **60** / Home mobile **55** |
| Blocking chrome bug | Desktop nav wrap (`Giving` second row) |
| Largest composition gap | Home desktop vs Stitch sidebar model |
| Preview vs public layout | **Same shared renderer** (+ preview banner only) |

Sacred Modernity tokens (**Hanken Grotesk**, violet `#6C5CE7`) are product SoT even when Stitch HTML samples cite Inter. Font-family diffs are scored as intentional, not defects.

---

## 1. Exact Stitch screens (from live MCP)

Approval/current status is inferred from **canonical map + live titles** (Stitch API has no separate “approved” flag). Prefer the titled “Refined / Populated / Restored” variants.

### 1.1 Canonical (use these)

| Surface | Exact Stitch title | Screen ID | Device | Artboard | Status |
|---------|--------------------|-----------|--------|----------|--------|
| Public home | `01-public-home-desktop-v2 (Refined)` | `ead45db5be774baa9454412262096ffc` | DESKTOP | 2560×4612 | **Canonical** |
| Public home | `01-public-home-mobile-v2 (Refined)` | `89177588fbf8405dbebd5747c38e19ce` | MOBILE | 780×6518 | **Canonical** |
| About | `02-public-about-desktop-v3 (Populated)` | `44492f6abbe849d0a8a89303ce83129b` | DESKTOP | 2560×5626 | **Canonical** |
| About | `02-public-about-mobile-v3 (Populated)` | `3f0b8a5c30544d9495064df8d5f9e62e` | MOBILE | 780×6596 | **Canonical** |
| Leadership | `03-public-leadership-desktop-v2 (Populated)` | `372faa60f8df4983b627db3cb5d35f9d` | DESKTOP | 2560×4434 | **Canonical** |
| Leadership | `03-public-leadership-mobile-v4 (Restored)` | `0f4e816fd64d4592bd3677fbde3b7544` | MOBILE | 780×4386 | **Canonical** |
| Leadership empty | `03-public-leadership-desktop-v2 (Empty)` | `5f7b1d44bd454d45a0b72fb76d94bbd0` | DESKTOP | 2560×2370 | **Empty-state SoT** |
| Ministries | `04-public-ministries-desktop-v4 (Populated)` | `f146cdccadb34ff3bd8b0b75a0450d15` | DESKTOP | 2560×4926 | **Canonical** |
| Ministries | `04-public-ministries-mobile-v4 (Populated)` | `d2fd7ecc586541d3beb5d0d3bed98d56` | MOBILE | 780×7982 | **Canonical** |
| Events (list) | `05-public-events-desktop-v2 (Populated)` | `6f618576f0304982bd239bfe04946e72` | DESKTOP | 2560×3292 | **Canonical** |
| Events (list) | `05-public-events-mobile-v2 (Populated)` | `f58c416cbbd545429258d963b3a15b60` | MOBILE | 780×3434 | **Canonical** |
| Events empty | `05-public-events-desktop-v2 (Empty)` | `6c3a2b460ac54e6a88336af9085e8c38` | DESKTOP | 2560×2586 | **Empty-state SoT** |
| Sermons | `06-public-sermons-desktop-v2 (Populated)` | `4f4995dc4ec84354ac80ed022a767ef3` | DESKTOP | 2560×4070 | **Canonical** |
| Sermons | `06-public-sermons-mobile-v2 (Populated)` | `96b380d4e47649c1bd7f05cabe9c3a1d` | MOBILE | 780×2164 | **Canonical** |
| Sermons empty | `06-public-sermons-desktop-v2 (Empty)` | `0c7262cdda4547739ec0c1fa5128fb51` | DESKTOP | 2560×3402 | **Empty-state SoT** |
| Giving | `07-public-giving-desktop-v2 (Populated)` | `59c8fdedf68a43e3a5d2384b0c2212df` | DESKTOP | 2560×4568 | **Canonical** |
| Giving | `07-public-giving-mobile-v2 (Populated)` | `a0616f23568c464a95eda9e317e2fa9d` | MOBILE | 780×3244 | **Canonical** |
| Giving empty | `07-public-giving-desktop-v2 (Empty)` | `a08093b9ec32467bad300ef43ac800fa` | DESKTOP | 2560×2792 | **Empty-state SoT** |
| Contact | `08-public-contact-desktop-v2 (Populated)` | `ab93d842bf2e49caa838a1fd414eb35b` | DESKTOP | 2560×5654 | **Canonical** |
| Contact | `08-public-contact-mobile-v2 (Populated)` | `9cbad6aacb6246549913e275f228fa80` | MOBILE | 780×3970 | **Canonical** |
| Shared header | `BlessBoard - Desktop Header Reference` | `43d6d1cb110240c8aa7e5989386ea63b` | DESKTOP | 2560×2392 | **Header SoT** |
| Shared header / mobile nav | `BlessBoard - Mobile Header Reference` | `2d430d9648cc404b88f7463e170aa3b5` | MOBILE | 780×2708 | **Mobile header SoT** |
| Design tokens board | `BlessBoard Public Visual System Board` | `8f689e44024444839a9c3174f03d4101` | DESKTOP | 2560×10090 | Token / component board |
| Shared UI states | `BlessBoard Shared UI States Board` | `b61a1ea8176648408211b681e942e0a6` | DESKTOP | — | Empty / shared states |

No dedicated standalone **footer** screen; footer is embodied in each public frame. No mobile empty variants for most public empties (desktop-only empties listed above).

### 1.2 Do not use (obsolete / duplicate / wrong product model)

| Title pattern | Example IDs | Why reject |
|---------------|-------------|------------|
| `01-public-home-desktop` / `01-public-home-mobile` (no v2) | `ff5da3e5…`, `7cb68d96…`, `f5b04bfb…`, `221636e5…`, `a3ec4058…`, `a52e64c6…` | Superseded by Refined v2 |
| `02-public-about-desktop` / `mobile` (no v3) | `4537dc72…`, `338e5c78…` | Superseded by Populated v3 |
| `02-public-about-sample-desktop (New Design System)` | `fa8f1b84…` | Sample / not product About |
| Leadership base + mobile v2 duplicates | `a779e04c…`, `9342690a…`, `025f0ef5…`, `2ca0d27a…` | Prefer populated D + **v4 Restored** M |
| `05-public-events-calendar-*` | `84b91938…`, `25677650…`, `0a38bd5b…`, `26db8f19…` | Calendar UI obsolete; V5 is list/featured |
| `06-public-sermons-resources-*` (pre-v2) | `ebe20757…`, `5902746f…` | Superseded by sermons v2 |
| `07-public-giving-information-*` | `14115440…`, `5b65875a…` | Superseded by giving v2 |
| `08-public-contact-desktop` / `mobile` (no v2) | `6d4d6ae2…`, `8f6f1528…` | Superseded by contact v2 |
| `04-public-ministries-*-v3` | `67fdba76…`, `ba2fbcfd…` | Superseded by v4 Populated |

---

## 2. Live implementation capture notes

| Viewport | Width | Notes |
|----------|-------|-------|
| Desktop (Stitch pair) | **1280** | Matches ~2560@2x artboard logical width |
| Mobile (Stitch pair) | **390** | Matches ~780@2x |
| Extra | **430**, **768** | iPhone-ish / tablet |

**Measured (live home):**

| Metric | Desktop 1280 | Mobile 390 |
|--------|--------------|------------|
| Header height | **~203px** (nav wrap) | ~161px |
| H1 size | 64px / 700 | ~31px / 700 |
| Font | Hanken Grotesk | Hanken Grotesk |
| Primary button radius | 16px | 16px |
| Hero media | `aspect-ratio: 1/1` square crop | Hidden on mobile (copy-first) |
| Preview banner | absent on public | present on `/hq/content/preview/home` |

Preview home at D/M: same section stack as public + `data-bb-preview-banner` / draft section — **layout parity with public renderer confirmed**.

---

## 3. Content parity (demo vs Stitch)

Classification key: **EXACT** · **EQUIVALENT** · **WEAK_PLACEHOLDER** · **MISSING** · **WRONG** · **BLOCKED_BY_MEDIA**

| Area | Live | Stitch | Class | Safe for testing demo? |
|------|------|--------|-------|------------------------|
| Church display name | BlessBoard Automated Test Church | Kafue / sample church names | EQUIVALENT | Keep fixture name (do not global-replace real churches) |
| Home hero headline | “A Place for Growth & Community” | “A Place for Spiritual Growth & Community” (D) / different mobile copy | EQUIVALENT | Yes — align closer to Stitch D phrasing |
| Home hero lead | Demo testing copy | Richer sanctuary/resources copy | WEAK_PLACEHOLDER | Yes — enrich demo-only |
| Official portal badge | Present (D) | Present | EXACT-ish | — |
| Announcement | `[Demo] This Week at Church` | “Annual Youth Summit…” cards + archive | WEAK_PLACEHOLDER | Yes — richer demo titles; no fake metrics |
| Service times | Present (incl. preserved Kafue Rd non-demo row) | Purple sidebar card + “Request a Visit” | EQUIVALENT structure / WEAK chrome | Demo entries OK; don’t overwrite non-demo |
| Prayer request widget | Absent | Present (form) | MISSING / product-blocked | **No** — no V5 public prayer POST |
| Member-count overlay | Absent | “1.2k+ Active members…” | MISSING / blocked | **No** — do not fabricate metrics |
| Digital Resources sidebar | Absent | Latest Sermon / Reading Plan | MISSING | Partial: link cards to `/sermons` only |
| Ministries / leadership / events / sermons teasers | Present with `[Demo]` | Present (different names) | WEAK_PLACEHOLDER | Yes for demo org only |
| About mission/vision/values | Present | Present + stats + impact grid | EQUIVALENT core / MISSING extras | Stats/impact **no** if fabricated |
| Leadership names | Jordan Hale (Demo) etc. | Rev. Dr. Samuel Musonda etc. | EQUIVALENT | Yes — fictional demo personas |
| Contact form | No `<form>` (CTA copy only) | “Send a Message” form | MISSING / blocked | **No** — unsupported |
| Giving methods | Bank transfer demo | Bank + Mobile Money + In-person + allocation | WEAK_PLACEHOLDER | Yes — add fictional methods; no payment |
| `[Demo]` title suffixes | Widespread on page heroes | Clean titles | WEAK_PLACEHOLDER | Soften for visual demos or confine to body |

**Do not** replace user-created / non-demo rows globally (e.g. existing service times with `bb_demo: false`).

---

## 4. Image parity

| Stitch area | Expected ratio (from frames) | Live asset | Local match? | Safe placeholder? | Notes |
|-------------|------------------------------|------------|--------------|-------------------|-------|
| Home hero | Landscape ~4:3 / wide rounded | `/church/images/tenant-public/home-desktop-hero.jpg` | Yes | Yes | **Live CSS forces `aspect-ratio: 1/1`** → square crop (**P1**) |
| Home hero mobile | Full-bleed / stacked visual | Asset exists; visual often hidden | Yes | Yes | Mobile Stitch shows image/ministry bands; live copy-first |
| About hero | Landscape rounded | `tenant-public/about-hero-building.jpg` | Yes | Yes | Overlap metric card omitted (blocked) |
| About story collage | Dual overlapping photos | Partial / weaker | `about/about-culture-*.jpg` exist | Yes | Underused |
| Leadership portraits | Portrait ~3:4 | `leadership/pastor-desktop.jpg` etc. | Yes | Yes | Wired in demo |
| Ministry cards | ~16:9 media | `leadership/ministry-*.jpg` | Yes | Yes | Wired |
| Event imagery | Featured wide + card thumbs | **Not in demo seed** | `events/event-*.jpg` exist | Yes | **MISSING in live demo** → image parity low |
| Sermon thumbs | Square/wide cards | **Not in demo seed** | `sermons/` + branch-admin thumbs | Yes | **MISSING in live demo** |
| Contact / map | Map panel | iframe/map when coords | `contact/contact-map-*.jpg` | Yes | Depends on branch lat/lng |
| Giving illustration / QR | Methods + optional QR | No dedicated hero; QR assets exist unused | `giving/giving-qr-*.jpg` | Yes | Optional demo only; no live payments |

**Do not hotlink** Stitch `lh3.googleusercontent.com` / external URLs — copy into `public/church/images/…` or CMS media.

Media storage does **not** block using existing local JPEGs for the testing org; gap is **seed wiring + CSS crop**, not missing files for most surfaces.

---

## 5. Page scores (0–100)

| Page | Structure | Typography | Spacing | Content | Image | Desktop | Mobile | **Overall** |
|------|-----------|------------|---------|---------|-------|---------|--------|-------------|
| Shared shell (header/nav/footer) | 62 | 80 | 58 | 72 | 75 | **52** | 70 | **67** |
| Home | 58 | 74 | 66 | 62 | 55 | 60 | **55** | **61** |
| About | 55 | 76 | 70 | 58 | 62 | 58 | 62 | **63** |
| Leadership | 74 | 78 | 68 | 66 | 72 | 72 | 70 | **71** |
| Ministries | 76 | 78 | 72 | 68 | 74 | 75 | 70 | **73** |
| Events | 78 | 78 | 72 | 70 | **42** | 72 | 70 | **69** |
| Sermons | 74 | 76 | 72 | 66 | **38** | 70 | 68 | **66** |
| Contact | 58 | 76 | 70 | 52 | 48 | 58 | 60 | **60** |
| Giving | 70 | 76 | 72 | 60 | 45 | 68 | 66 | **65** |
| Preview (home) | 58* | 74 | 66 | 70† | 55 | 60 | 55 | **62** |

\*Same structure as public (+ banner). †Draft visible (correct for preview).

**Site overall (weighted mean of page overalls, shell counted once): ~64.**

---

## 6. Gap priority

### P0 — broken / structurally wrong

1. **Desktop primary nav overflow** — at 1280px, `Giving` wraps to a second centered row; header ~203px. Breaks Stitch single-row header (`43d6d1cb…`).
2. **Brand lockup truncation** — `max-width: 14rem` + ellipsis cuts “BlessBoard Automated Test Church” on every page.

### P1 — major visible mismatch

1. **Home desktop composition** — Stitch: announcements + ministries + **sidebar** (service times, prayer, digital resources). Live: vertical CMS stack (service times → announce → welcome → teasers → CTA pair). Not the same information architecture.
2. **Home hero image treatment** — Stitch landscape rounded media (+ metric overlay). Live **1:1** `object-fit: cover` square.
3. **About missing major blocks** — stats bar, “Watch Our Story”, community impact 2×2, overlapping story collage, annual report CTA (stats/report **blocked** if fabricated; chrome still missing).
4. **Events / sermons image absence** in testing demo despite local assets.
5. **Contact message form** absent vs Stitch (product **BLOCKED**; chrome/CTA still misleading if it implies send).
6. **Page-hero first viewport** on listing pages (Leadership/Events/Sermons/Ministries) — large empty gradient before content vs denser Stitch heroes.

### P2 — polish

1. Nav density / mid-width (900–1199) still fragile given 8 CMS links vs Stitch’s 5.
2. Footer: Stitch newsletter / Privacy / four-column density vs live Quick Links + members band.
3. `[Demo]` in H1 titles reads as unfinished vs Stitch clean titles.
4. Button/order label microcopy vs Stitch (“Join a Service”, “Request a Visit”, etc.).
5. Mobile home section order vs refined mobile frame (service times card chrome, empty announcement treatment).

### P3 — optional

1. Social icon set / footer social completeness.
2. Empty-state illustration parity when lists are empty (desktop empty IDs exist; live empty not exercised with seed filled).
3. Tablet 768 intermediate spacing tweaks.

### BLOCKED

| Gap | Reason |
|-----|--------|
| Prayer request form on public home | No supported public prayer POST / schema |
| Fabricated member / impact metrics overlays | Product rule: no invented KPIs |
| Contact POST form | Unsupported |
| Payment / live Mobile Money checkout | Info-only giving |
| Calendar events UI | Obsolete Stitch; V5 list model |
| Mobile bottom-tab + FAB nav | Product uses drawer (intentional); do not ship Stitch bottom tabs without product decision |
| Exact Stitch Inter font | Sacred Modernity = Hanken Grotesk |

---

## 7. Implementation plan (≤5 batches)

### Batch 1 — Shared shell, tokens, header, footer

| | |
|--|--|
| **Files** | `views/blessboard/v5/partials/tenant-public-shell-start.ejs`, `tenant-public-shell-end.ejs`, `public/blessboard/v5/tenant-public.css` (+ `design-tokens.css` if header tokens), `public/blessboard/v5/tenant-public.js` (drawer only if needed) |
| **Stitch** | `43d6d1cb110240c8aa7e5989386ea63b`, `2d430d9648cc404b88f7463e170aa3b5`, Public Visual System `8f689e44024444839a9c3174f03d4101` |
| **Sections** | Header height/single-row nav; brand ellipsis; gutter; footer columns/socials density; mobile drawer chrome vs header ref |
| **Demo data** | None required |
| **Assets** | Existing brand mark only |
| **Tests** | `blessboard-v5-frontend-assets`, public shell assertions; visual/CSS version bump |
| **Exclusions** | Bottom-tab nav; apex marketing shell; auth shells |
| **Done when** | At 1280px all 8 nav items single row **or** deliberate overflow menu matching Stitch density; brand name readable; header height ≈ Stitch (~72–88px logical); footer spacing within ~8px of frames |

### Batch 2 — Home page

| | |
|--|--|
| **Files** | `views/blessboard/v5/public/home.ejs`, `tenant-public.css`, optionally `loadTenantPublicPageModel.js` (teaser mapping only) |
| **Stitch** | `ead45db5…` / `89177588…` |
| **Sections** | Hero ratio/CTAs; service-times chrome; announcement cards; ministries teaser; optional resources link row; **do not** add prayer form or fake KPIs |
| **Demo data** | Enrich demo announcement/hero copy for testing org only; keep non-demo service times |
| **Assets** | Reuse `home-desktop-hero.jpg` / `home-mobile-hero.jpg`; fix crop via CSS |
| **Tests** | `blessboard-public-pages` home markers; demo seed tests if copy keys change |
| **Exclusions** | Prayer POST; member-count overlay; calendar |
| **Done when** | Desktop hero landscape matches Stitch treatment; section rhythm closer to refined v2 without inventing widgets; mobile stack matches refined mobile within known intentional drawer nav |

### Batch 3 — About and leadership

| | |
|--|--|
| **Files** | `public/about.ejs`, `public/leadership.ejs`, `tenant-public.css` |
| **Stitch** | About `44492f6a…` / `3f0b8a5c…`; Leadership `372faa60…` / `0f4e816f…`; empty `5f7b1d44…` |
| **Sections** | About story media treatment; mission/vision cards; join CTA; leadership featured + grid; empty leadership |
| **Demo data** | Optional story/mission wording for demo org; no fake “1984 / 34 ministries” stats |
| **Assets** | `about-hero-building.jpg`, `about/about-culture-*.jpg`, leadership portraits |
| **Tests** | Public about/leadership markers |
| **Exclusions** | Fabricated impact stats; annual report download unless real file |
| **Done when** | About/leadership desktop+mobile match populated frames for **supported** fields; empty leadership matches empty SoT |

### Batch 4 — Ministries, events, sermons

| | |
|--|--|
| **Files** | `public/ministries.ejs`, `public/events.ejs`, `public/sermons.ejs`, `tenant-public.css`, `testingWebsiteDemoContentSpec.js` (testing seed only) |
| **Stitch** | Ministries `f146cdcc…` / `d2fd7ecc…`; Events `6f618576…` / `f58c416c…`; Sermons `4f4995dc…` / `96b380d4…`; empties `6c3a2b46…`, `0c7262cd…` |
| **Sections** | Card grids; featured event/sermon; category display already present; empty states |
| **Demo data** | Wire `events/event-*.jpg` and sermon thumbs for **automated-test-church** demo rows only |
| **Assets** | Existing `public/church/images/events/*`, `sermons/*`, ministry images |
| **Tests** | Public pages + demo content seed tests |
| **Exclusions** | Series/scripture/duration schema invention; calendar UI; category chip filters without fields |
| **Done when** | Featured + grid show real local images; empty templates match empty Stitch when data cleared in a test fixture |

### Batch 5 — Contact, giving, mobile, final polish

| | |
|--|--|
| **Files** | `public/contact.ejs`, `public/giving.ejs`, shells/CSS, demo spec for giving methods |
| **Stitch** | Contact `ab93d842…` / `9cbad6aa…`; Giving `59c8fded…` / `a0616f23…`; empty giving `a08093b9…`; mobile header `2d430d96…` |
| **Sections** | Contact channels, service/office strips, map; honest non-form CTA; giving methods + disclaimer; mobile drawer polish; 390/430/768 sweep |
| **Demo data** | Optional fictional mobile-money **instructions** (not checkout); map coords if missing for demo branch |
| **Assets** | `contact/contact-map-*.jpg`, `giving/giving-qr-*.jpg` as decorative only |
| **Tests** | Public contact/giving; preview smoke; responsive assertions |
| **Exclusions** | Contact POST; payment gateway; weakening cache headers |
| **Done when** | Contact/giving chrome match Stitch for supported content; no implied submit/pay; mobile drawer matches header ref; P0 nav/brand fixed verified at 1280/390/430/768 |

---

## 8. Safety / process notes

- No runtime code changed in this prompt (documentation only).
- Preview already uses shared public renderer (PHASE2_083); visual gaps are **presentation + demo content**, not legacy preview chrome.
- Demo-data changes in later batches must target **testing / `bb_demo` rows** only — never global overwrite of church-owned content.

---

## 9. Evidence locations (local agent artifacts)

| Artifact | Path |
|----------|------|
| Stitch HTML/PNG | `/tmp/bb084/stitch/` |
| Live HTML (desktop) | `/tmp/bb084/live/` |
| Screenshots | `/tmp/bb084/screens/` |
| Measurements JSON | `/tmp/bb084/measurements.json` |
