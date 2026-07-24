# PHASE2_087 — About & Leadership ↔ Stitch parity

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 public **About** and **Leadership** only  
**Prerequisite:** `PHASE2_084` · `PHASE2_085` shell · `PHASE2_086` home  
**Constraint:** Real CMS first; testing/demo soft-fill only when fields empty; no fabricated stats / department groups / Contact Pastor actions; V4 untouched

---

## 1. Stitch screens used

| Surface | Title | Screen ID |
|---------|-------|-----------|
| About desktop | `02-public-about-desktop-v3 (Populated)` | `44492f6abbe849d0a8a89303ce83129b` |
| About mobile | `02-public-about-mobile-v3 (Populated)` | `3f0b8a5c30544d9495064df8d5f9e62e` |
| Leadership desktop | `03-public-leadership-desktop-v2 (Populated)` | `372faa60f8df4983b627db3cb5d35f9d` |
| Leadership mobile | `03-public-leadership-mobile-v4 (Restored)` | `0f4e816fd64d4592bd3677fbde3b7544` |
| Leadership empty | `03-public-leadership-desktop-v2 (Empty)` | `5f7b1d44bd454d45a0b72fb76d94bbd0` |

---

## 2. Files changed

| File | Change |
|------|--------|
| `views/blessboard/v5/public/about.ejs` | Section markers, blank collapse, soft-fill hooks, `hrefFor`, service time labels |
| `views/blessboard/v5/public/leadership.ejs` | Featured + grid titles D/M, portrait dims, bio snippet, Join a Ministry CTA, soft intro |
| `public/blessboard/v5/tenant-public.css` | Story fallback, leadership grid title D/M, portrait ratios (existing + polish) |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `aboutDemoFallback`, `leadershipDemoFallback`, `cssHref?v=34` |
| `src/blessboard/services/testingWebsiteDemoContentSpec.js` | About hero → “About Our Church” |
| Shell / preview defaults | `tenant-public.css?v=34` |
| `tests/blessboard-public-pages.test.js` | PHASE2_087 about + leadership cases |
| `tests/blessboard-v5-frontend-assets.test.js` | v34 + PHASE2_087 CSS assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Leadership CTA label |
| `docs/phase2/PHASE2_087_ABOUT_LEADERSHIP_STITCH_PARITY.md` | This doc |

---

## 3. About sections completed

| Section | Notes |
|---------|--------|
| Hero | About Us / Our Identity eyebrows; accent title; landscape 4:3 media; Get Connected (desktop CTA) |
| Story | Band + optional collage / local gradient fallback |
| Mission / Vision | Purpose pair; violet accent vision card |
| Values | Core Values list; blank items omitted |
| Service information | Stored service times + contact strip |
| Join CTA | Plan Your Visit / Register (D); Member Login / Register Now (M) |
| **Not shipped** | Impact stats, Annual Report, Watch Our Story video |

---

## 4. Leadership sections completed

| Section | Notes |
|---------|--------|
| Page hero | Faith & Community / Leadership eyebrows; intro from CMS or soft demo |
| Featured | First by `sort_order`; portrait **4:5**; initials fallback |
| Grid | Ministry Leaders (D) / Ministry Leads (M); mobile horizontal cards; desktop portrait tiles |
| Bio | Full on featured; snippet on grid |
| Closing CTA | Want to serve + Join a Ministry / Contact |
| Empty | Update in progress + CTA; no invented people/groups |

---

## 5. Image / fallback behavior

- CMS `mediaUrl` / leader `imageUrl` first (safe local or sanitized URLs).
- Testing/demo soft-fill hero/story media from `testingWebsiteDemoContentSpec` MEDIA paths only when empty.
- Missing portraits → initials avatars (no stock people).
- Story without media → CSS gradient placeholder (no Stitch hotlink).

---

## 6. Desktop / mobile behavior

| | Desktop | Mobile |
|--|---------|--------|
| About hero | Two-column + Get Connected | Identity eyebrow; CTAs hidden (Stitch); image under copy 16:9 |
| About purpose | Mission \| Vision pair | Stacked cards |
| Leadership featured | Side-by-side portrait card | Stacked |
| Leadership grid | 2-col portrait cards | Horizontal name/role cards |
| Overflow | `min-width: 0` + body `overflow-x: clip` | Same at 390 |

---

## 7. Tests and results

```bash
node --test tests/blessboard-v5-frontend-assets.test.js tests/blessboard-public-pages.test.js
```

**Result (2026-07-24):** `# tests 55` · `# pass 55` · `# fail 0`

Also updated `blessboard-v5-a11y-structure` leadership CTA expectation to **Join a Ministry**.

---

## 8. Remaining gaps

1. Stitch “Community Impact” / KPI tiles — product-blocked (no invented counts).
2. Watch Our Story / Contact Pastor / View Profile — unsupported actions.
3. Mobile Stitch pastoral-team / elders department groups — not inferred from flat leader list.
4. Exact microcopy when CMS differs from Kafue sample frames.
5. Ministries / events / sermons / contact / giving remain Batches 4–5.
