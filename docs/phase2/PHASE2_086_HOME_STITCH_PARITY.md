# PHASE2_086 — Church public home ↔ Stitch parity

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 church **public home** only (`views/blessboard/v5/public/home.ejs` + home CSS/model)  
**Prerequisite:** `PHASE2_084` audit · `PHASE2_085` shared shell  
**Constraint:** Real CMS content; testing/demo soft-fill only when canonical empty; no invented KPIs / prayer POST; draft vs published preserved

---

## 1. Stitch screens used

| Device | Title | Screen ID |
|--------|-------|-----------|
| Desktop | `01-public-home-desktop-v2 (Refined)` | `ead45db5be774baa9454412262096ffc` |
| Mobile | `01-public-home-mobile-v2 (Refined)` | `89177588fbf8405dbebd5747c38e19ce` |

Project: `17124191473876947591` (GetPro Church Platform). Shared chrome from Prompt 085 (header `43d6d1cb…` / `2d430d96…`) — not reworked here.

---

## 2. Files changed

| File | Change |
|------|--------|
| `views/blessboard/v5/public/home.ejs` | Stitch section order, hero, band (announce/ministries \| service + resources), teasers, CTAs, demo soft-fill hooks |
| `views/blessboard/v5/public/_home-digital-resources.ejs` | Shared digital-resources links (sermons/events) — no invented titles |
| `public/blessboard/v5/tenant-public.css` | Hero **4:3** landscape; violet service card; home band grid; mobile aside `order: -1` |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `homeDemoFallback` for testing/demo; `cssHref?v=33` |
| `src/blessboard/services/testingWebsiteDemoContentSpec.js` | Hero copy closer to Stitch (“Spiritual Growth & Community”) |
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | Default CSS `?v=33` |
| `views/blessboard/v5/content-admin/preview.ejs` | Obsolete template CSS `?v=33` |
| `tests/blessboard-public-pages.test.js` | Home section order, empty collapse, escape, soft-fill, mobile markers, draft/public |
| `tests/blessboard-v5-frontend-assets.test.js` | `tenantPublic: 33` + PHASE2_086 CSS/structure assertions |
| `docs/phase2/PHASE2_086_HOME_STITCH_PARITY.md` | This doc |

---

## 3. Sections matched

| Stitch area | Implementation |
|-------------|----------------|
| Hero | Eyebrow D/M, accent heading, lead, primary/secondary CTAs, landscape media |
| Service times | Violet sidebar card + Plan a Visit |
| Digital resources | Link row to `/sermons` + `/events` (no fake sermon titles) |
| Announcement highlight | From published home announcement section / soft demo |
| Ministries teaser | Up to 4 published ministries in band |
| Welcome/about blocks | Remaining non-empty home sections |
| Leadership / events / sermons teasers | Collapse when empty |
| Give + Visit CTAs | `data-bb-home-cta-pair` |
| Explore + member band | Shortcuts + login/register |
| Footer transition | Unchanged shell footer from 085 |

**Not shipped (product blocks from 084):** prayer request form, fabricated member counts, calendar UI, Inter font (Hanken retained).

---

## 4. Demo fallback behavior

- `homeDemoFallback` is attached only when `dataEnvironment` is `testing` or `demo` **and** the home is not in the intentional empty state.
- Template prefers **CMS** hero heading/body/media and announcement; demo values apply only when those are empty.
- Fully empty homes (no published sections and no teasers) still show the designed empty state — soft-fill does not invent a populated page from nothing.
- Seeded demo rows (Prompt 078/081) remain the primary content path when present.

---

## 5. Image behavior

- Hero uses stored `mediaUrl` when present; else testing/demo soft-fill URL (`/church/images/tenant-public/home-desktop-hero.jpg`); else local CSS gradient fallback (no Stitch hotlink).
- Intrinsic size **960×720** + CSS `aspect-ratio: 4 / 3` + `object-fit: cover`.
- Mobile refined frame is copy-first: hero visual `display: none` below 768px (Stitch mobile stack).

---

## 6. Desktop / mobile behavior

| | Desktop (≥768) | Mobile (≤767 / 390) |
|--|----------------|---------------------|
| Hero | Two-column; portal eyebrow; Join a Service + Giving | Centered; sanctuary eyebrow; Join Our Next Service + Explore Ministries; image hidden |
| Band | Announce + ministries \| service card + resources | Service card first (`order: -1`), then announce/ministries |
| Overflow | `overflow-x: clip` on body; band `min-width: 0` | Same; no horizontal scroll target at 390 |

---

## 7. Tests and results

```bash
node --test tests/blessboard-v5-frontend-assets.test.js tests/blessboard-public-pages.test.js
```

**Result (2026-07-24):** `# tests 52` · `# pass 52` · `# fail 0`

Coverage:

- Every home section marker + DOM order
- Empty teaser collapse / blank section omit
- HTML escaping; CMS over demo
- Soft-fill on testing home when CMS hero/announce empty (with non-empty shell)
- Intentional empty state preserved when no sections/teasers
- Draft off public; preview wiring shared
- Landscape hero + band + violet card CSS
- Cache bust `tenant-public.css?v=33`

---

## 8. Remaining home-page gaps

1. Exact Stitch microcopy (“Get Directions”, “View Archive”, empty “No Active Notices” illustration) when CMS has no announcement — optional empty-announce chrome not fully illustrated.
2. Connected-community mosaic cards on mobile Stitch (Digital Giving / Events / Resources tiles) — we use link list + later give/visit pair instead of inventing tiles.
3. Hero media still hidden on mobile (matches refined mobile HTML; optional show-under-copy if product wants desktop image on phone).
4. Pixel-perfect spacing vs 2560 artboard — within Sacred Modernity tokens, not 1:1 px.
5. About/leadership/ministries/events/sermons/contact/giving page parity remains Batches 3–5 in `PHASE2_084`.
