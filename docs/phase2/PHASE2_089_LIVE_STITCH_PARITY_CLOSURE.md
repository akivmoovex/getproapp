# PHASE2_089 — Live Stitch parity closure audit

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 testing church website on Hostinger (`automated-test-church`) vs exact Stitch screens from `PHASE2_084`  
**Prerequisite claim:** Prompts 085–088 complete; latest V5 revision deployed; Node restarted  
**Constraint:** Fix only clear P0/P1; no new features; no V4 changes

**Live bases**

- Public: `https://blessboard.org/c/automated-test-church`
- Preview: `https://blessboard.org/hq/content/preview/{pageKey}`

**Stitch project:** `projects/17124191473876947591` (canonical IDs in `PHASE2_084` §1.1)

---

## Verdict

**NOT_DEPLOYED**

Hostinger still serves the **PHASE2_083 / PHASE2_084** live revision (`tenant-public.css?v=31`), not the local 085–088 Stitch-parity revision (`?v=35`).

| Expectation after 085–088 | Live Hostinger (2026-07-24 audit) |
|---------------------------|-----------------------------------|
| `tenant-public.css?v=35` | **`?v=31`** |
| Desktop nav `flex-wrap: nowrap`; brand without `14rem` ellipsis | Brand still `max-width: 14rem`; no live `data-bb-nav` markers |
| Home band + violet service card + “Spiritual Growth” hero | Vertical stack; H1 **“A Place for Growth & Community”**; hero CSS **`aspect-ratio: 1 / 1`** |
| Local CSS SHA ≠ live | Live CSS **73155** bytes, SHA `73de40b9…` (matches PHASE2_083); local **79722** bytes, SHA `d0f87452…` |
| Working tree includes 085–088 | Changes are **local / uncommitted**; tip commit `33fd042` has no 085–088 in git history |

**No P0/P1 code fixes applied in this prompt** — defects remain on live because the closure revision is not deployed. Local tree already contains the Batch 1–N fixes from 085–088; shipping those is a deploy/restart step, not additional feature work.

---

## 0. Deployment evidence

| Field | Value |
|-------|--------|
| Local branch | `V5` |
| Local / `origin/V5` tip (committed) | `33fd042331d010a0079eacc781036cc623284187` |
| Hostinger `git rev-parse` | **Unavailable** (SSH closed; same constraint as PHASE2_083) |
| Inferred deployed tip | **`33fd042…`** — live CSS byte-identical to PHASE2_083 tip asset |
| Live CSS link | `tenant-public.css?v=31` |
| Live CSS `Last-Modified` | `Fri, 24 Jul 2026 16:11:40 GMT` |
| Expected if 088 shipped | `tenant-public.css?v=35` + home/about/… soft-fill + shell nowrap |

**Public HTTP:** all eight public pages **200**.  
**Preview (unauthenticated):** `/hq/content/preview/home` → **401** (“Sign-in is required.”). Authenticated preview parity was last confirmed in **PHASE2_083** (shared shell + `data-bb-preview-banner`); not re-logged in this closure pass.

---

## 1. Verification checklist (live)

| # | Check | Live result |
|---|--------|-------------|
| 1 | Shared header / footer | Present (`data-bb-header`, `data-bb-footer`); header still multi-row on desktop (084 P0) |
| 2 | Desktop navigation | 8 CMS links; wrap risk unchanged vs 084 |
| 3 | Mobile drawer | Present; no Stitch bottom-tab/FAB (intentional) |
| 4 | Home | Pre-086 composition; no `data-bb-home-band` / service card |
| 5 | About | Populated demo; missing Stitch stats/impact (blocked / chrome gap) |
| 6 | Leadership | Populated portraits; structure nearer Stitch than home |
| 7 | Ministries | Populated cards; solid relative score |
| 8 | Events | Featured + list; card media often **fallback** (no demo image wiring) |
| 9 | Sermons | Featured + list; thumbs often **fallback** |
| 10 | Contact | Channels + map + honest non-form “Send a Message”; no POST |
| 11 | Giving | Info-only; `DEMO-…` / TEST ONLY copy; no payment UI |
| 12 | Preview banner | Not re-verified (401 unauthenticated); 083 confirmed when signed in |
| 13 | Draft / public separation | Not re-verified this pass; 083 confirmed draft marker only in preview |
| 14 | Demo-content completeness | Demo present; weaker than Stitch richness; `[Demo]` titles |
| 15 | Images / placeholders | Hero + leadership/ministry assets; events/sermons often icon fallbacks |
| 16 | Typography | Hanken Grotesk / Sacred Modernity (not Stitch Inter — intentional) |
| 17 | Spacing | Acceptable; denser Stitch heroes still ahead |
| 18 | Buttons | Primary violet / radii present |
| 19 | Cards | Directory + teaser cards; home sidebar card model missing |
| 20 | 390px overflow | `overflow-x: clip` on shell; no new overflow fix beyond 084 baseline |
| 21 | 430px layout | Same baseline as 084 (not re-scored with Playwright this pass) |
| 22 | 768px layout | Same baseline as 084 |
| 23 | Empty states | Seed filled — empty Stitch frames not exercised live |
| 24 | Accessibility basics | Skip link, drawer `aria-expanded` / `aria-controls`, landmarks present |
| 25 | No V4 changes | Working tree has **no** `views/church/**` or `public/church/church.css` edits for this audit |

---

## 2. Page scores (0–100) — same system as PHASE2_084

Live revision unchanged from the 084 audit (`?v=31`). Scores are therefore **reaffirmed**, not improved.

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

\*Same structure as public (+ banner when authenticated). †Draft visible in preview (083).

**Site overall (weighted mean of page overalls, shell counted once): ~64 / 100.**

---

## 3. P0 / P1 remaining on live

### P0 (still open on Hostinger)

1. **Desktop primary nav overflow** — Giving wraps to a second row; header ~203px vs Stitch single-row (`43d6d1cb…`). Fixed locally in 085 (`flex-wrap: nowrap`) — **not live**.
2. **Brand lockup truncation** — `max-width: 14rem` + ellipsis on “BlessBoard Automated Test Church”. Fixed locally in 085 — **not live**.

### P1 (still open on Hostinger)

1. **Home desktop composition** — no announcements+ministries | violet service + resources band (086 local only).
2. **Home hero image** — live CSS still `aspect-ratio: 1 / 1` square crop (086 local `4 / 3`).
3. **About chrome gaps** — stats/impact/report blocked if fabricated; remaining visual chrome not on live 087 build.
4. **Events / sermons demo images** — list cards use `is-fallback` media despite local JPEG inventory.
5. **Contact message form** — product-blocked; honest CTA present (not a deploy gap).
6. **Listing page-hero density** vs denser Stitch heroes.

### P0/P1 fixes not applied here

Closure requires **deploy + Node restart** of the local 085–088 tree (`cssHref?v=35`), then a re-audit. No additional presentation bugs were patched in this prompt beyond documenting the deploy gap.

---

## 4. Media-blocked / product-blocked differences

| Gap | Reason |
|-----|--------|
| Prayer request form on public home | No supported public prayer POST |
| Fabricated member / impact KPIs | No invented metrics |
| Contact POST form | Unsupported |
| Payment / live Mobile Money checkout | Info-only giving |
| Calendar events UI | Obsolete Stitch; V5 list model |
| Mobile bottom-tab + FAB | Product uses drawer |
| Exact Stitch Inter font | Sacred Modernity = Hanken Grotesk |

These are **not** deploy blockers; they remain intentional after 085–088 as well.

---

## 5. Local readiness (not live)

| Prompt | Doc | Local CSS / markers |
|--------|-----|---------------------|
| 085 | `PHASE2_085_SHARED_SHELL_STITCH_PARITY.md` | nowrap nav, brand title, `data-bb-nav` |
| 086 | `PHASE2_086_HOME_STITCH_PARITY.md` | home band, service card, hero 4:3 |
| 087 | `PHASE2_087_ABOUT_LEADERSHIP_STITCH_PARITY.md` | about/leadership soft-fills |
| 088 | `PHASE2_088_REMAINING_PUBLIC_PAGES_STITCH_PARITY.md` | remaining pages + `?v=35` |

**Local tests (this audit):**

```bash
node --test tests/blessboard-v5-frontend-assets.test.js tests/blessboard-public-pages.test.js
```

**Result:** `# tests 57` · `# pass 57` · `# fail 0`

---

## 6. Exact manual URLs

**Public**

- https://blessboard.org/c/automated-test-church
- https://blessboard.org/c/automated-test-church/about
- https://blessboard.org/c/automated-test-church/leadership
- https://blessboard.org/c/automated-test-church/ministries
- https://blessboard.org/c/automated-test-church/events
- https://blessboard.org/c/automated-test-church/sermons
- https://blessboard.org/c/automated-test-church/contact
- https://blessboard.org/c/automated-test-church/giving

**Preview (auth required)**

- https://blessboard.org/hq/content/preview/home
- https://blessboard.org/hq/content/preview/about
- https://blessboard.org/hq/content/preview/leadership
- https://blessboard.org/hq/content/preview/ministries
- https://blessboard.org/hq/content/preview/events
- https://blessboard.org/hq/content/preview/sermons
- https://blessboard.org/hq/content/preview/contact
- https://blessboard.org/hq/content/preview/giving

**Asset**

- https://blessboard.org/blessboard/v5/tenant-public.css?v=31 (live linked)
- Expected after deploy: `…/tenant-public.css?v=35`

---

## 7. Next step to reach MATCHED / MATCHED_WITH_BLOCKED_MEDIA

1. Commit and deploy the local 085–088 working tree to Hostinger app root.
2. Restart the Node application.
3. Confirm HTML links `tenant-public.css?v=35` and home shows Spiritual Growth + `data-bb-home-band`.
4. Re-run this closure prompt (or a thin 089 follow-up) for rescored verdict.

Until then, overall live parity remains **~64** with P0 nav/brand defects open.
