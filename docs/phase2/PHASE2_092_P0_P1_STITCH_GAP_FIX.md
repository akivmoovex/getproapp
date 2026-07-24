# PHASE2_092 — P0/P1 Stitch gap fixes (tenant public v36)

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 tenant public website only  
**Inputs:** `PHASE2_084`, `PHASE2_091`, exact approved Stitch desktop/mobile screens  
**Constraint:** No prayer POST, fabricated KPIs, payment/checkout, calendar, bottom-tab/FAB, fake contact form; keep Hanken Grotesk; no V4 changes

---

## 1. Stitch screens used

| Surface | Title | Screen ID |
|---------|-------|-----------|
| Header D | BlessBoard - Desktop Header Reference | `43d6d1cb110240c8aa7e5989386ea63b` |
| Header M | BlessBoard - Mobile Header Reference | `2d430d9648cc404b88f7463e170aa3b5` |
| Home D | 01-public-home-desktop-v2 (Refined) | `ead45db5be774baa9454412262096ffc` |
| Home M | 01-public-home-mobile-v2 (Refined) | `89177588fbf8405dbebd5747c38e19ce` |
| About D | 02-public-about-desktop-v3 (Populated) | `44492f6abbe849d0a8a89303ce83129b` |
| About M | 02-public-about-mobile-v3 (Populated) | `3f0b8a5c30544d9495064df8d5f9e62e` |
| Leadership D/M | populated / restored | `372faa60…` / `0f4e816f…` |
| Ministries D/M | v4 populated | `f146cdcc…` / `d2fd7ecc…` |
| Events D/M | v2 populated | `6f618576…` / `f58c416c…` |
| Sermons D/M | v2 populated | `4f4995dc…` / `96b380d4…` |
| Contact D/M | v2 populated | `ab93d842…` / `9cbad6aa…` |

Project: `projects/17124191473876947591`.

---

## 2. Files changed

| File | Change |
|------|--------|
| `public/blessboard/v5/tenant-public.css` | Nav density @1200; brand mobile width; denser `.bb-tp-dir-hero` / about / contact; `html` overflow-x clip; sermon media img; featured sermon media grid |
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | CSS default `?v=36` |
| `views/blessboard/v5/content-admin/preview.ejs` | CSS `?v=36` |
| `views/blessboard/v5/public/home.ejs` | Stale “Growth & Community” → Spiritual Growth soft polish; accent “Spiritual Growth…” |
| `views/blessboard/v5/public/events.ejs` | Demo `introMediaUrl` wiring |
| `views/blessboard/v5/public/ministries.ejs` | Demo `introMediaUrl` wiring |
| `views/blessboard/v5/public/sermons.ejs` | Real thumbs when `imageUrl`; featured media; demo intro media |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `mapSermon.imageUrl`; demo soft-fill for event/sermon thumbs; listing intro media; `cssHref?v=36` |
| `src/blessboard/services/testingWebsiteDemoContentSpec.js` | Local `MEDIA` event/sermon paths on EVENTS/SERMONS + `relativeDates` |
| `src/blessboard/services/testingWebsiteDemoContentService.js` | `patchEntityImage` for `event` |
| `tests/blessboard-v5-frontend-assets.test.js` | `VERSIONS.tenantPublic=36` + PHASE2_092 static guards |
| `tests/blessboard-public-pages.test.js` | `?v=36` + PHASE2_092 runtime soft-fill / contact / stale hero |
| `docs/phase2/PHASE2_092_P0_P1_STITCH_GAP_FIX.md` | This report |

**Not changed:** V4 `views/church/**`, `public/church/church.css`, apex marketing shell.

---

## 3. P0 gaps fixed

1. **Desktop nav one-row** — reinforced `flex-wrap: nowrap` + tighter @1200 gap/font/CTA padding so 8 CMS links stay on one row at 1280.  
2. **Brand truncation** — no desktop `14rem` ellipsis; mobile brand max widened to wrap safely without colliding with the menu.

(Both were largely closed on live v35; v36 hardens CSS + tests.)

---

## 4. P1 gaps fixed

1. **Home composition / hero** — landscape `4 / 3` retained; stale demo hero heading polished to “Spiritual Growth & Community”; accent targets Spiritual Growth phrase.  
2. **About chrome** — tighter page-hero / story / purpose spacing and card padding (no KPI tiles).  
3. **Listing-page hero density** — `.bb-tp-dir-hero` padding/title/lead reduced; body pulled closer; demo intro media for leadership/ministries/events/sermons.  
4. **Event/sermon image fallbacks** — demo catalog local JPEGs; seed can patch event `image_url`; testing soft-fill for `[Demo]` / catalog titles; sermon cards/featured render `<img>` when `imageUrl` present.  
5. **Contact presentation** — denser hero/cards/message layout; still honest non-form (`data-bb-contact-form="unavailable"`).  
6. **390 overflow** — `overflow-x: clip` on `html` and body.

---

## 5. Explicitly blocked features

| Feature | Status |
|---------|--------|
| Prayer submission | Not implemented |
| Fabricated KPIs / member metrics | Not implemented |
| Payment / Mobile Money checkout | Not implemented |
| Events calendar widget | Not implemented (list/featured only) |
| Bottom-tab / FAB mobile nav | Not implemented (drawer retained) |
| Fake contact POST form | Not implemented |
| Switch to Inter | Not done (Hanken Grotesk retained) |
| Stitch hotlinked images | Not used |

---

## 6. CSS version

`tenant-public.css?v=36` (shell default, model `cssHref`, obsolete preview template, tests).

---

## 7. Tests and results

```bash
node --test tests/blessboard-v5-frontend-assets.test.js tests/blessboard-public-pages.test.js
```

**Result (2026-07-24):** `# tests 59` · `# pass 59` · `# fail 0`

Guards cover: nav nowrap, no desktop brand `14rem`, hero `4 / 3`, denser dir-hero, demo media soft-fill, no contact `<form>`/POST, 390 overflow clip, V4 shell/CSS untouched.

---

## 8. Remaining gaps

1. Authenticated preview banner/draft re-check still needs a signed-in pass (public isolation unchanged).  
2. About Stitch stats / impact / annual report chrome remain **blocked** if fabricated.  
3. Contact message POST remains **blocked**.  
4. Non-demo churches without CMS media still show icon/gradient fallbacks (correct).  
5. Live Hostinger still needs deploy of v36 + optional demo refresh for persisted event `image_url` rows (soft-fill covers testing `[Demo]` titles without re-seed).

---

## 9. V4 confirmation

No edits under `views/church/**` or `public/church/church.css`. Tests assert V4 about/home partials and `church.css` still exist and V5 shell does not load `church.css`.
