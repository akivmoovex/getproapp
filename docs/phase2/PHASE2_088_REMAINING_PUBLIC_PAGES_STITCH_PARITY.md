# PHASE2_088 — Remaining public pages ↔ Stitch parity

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 public **Ministries**, **Events**, **Sermons**, **Contact**, **Giving**  
**Prerequisite:** `PHASE2_084`–`087`  
**Constraint:** Real CMS first; testing soft-fill for empty intros only; no fake checkout/forms/calendar; no V4 changes; no Stitch hotlinks

---

## 1. Stitch screens used

| Page | Desktop | Mobile | Empty |
|------|---------|--------|-------|
| Ministries | `f146cdccadb34ff3bd8b0b75a0450d15` | `d2fd7ecc586541d3beb5d0d3bed98d56` | — |
| Events | `6f618576f0304982bd239bfe04946e72` | `f58c416cbbd545429258d963b3a15b60` | `6c3a2b460ac54e6a88336af9085e8c38` |
| Sermons | `4f4995dc4ec84354ac80ed022a767ef3` | `96b380d4e47649c1bd7f05cabe9c3a1d` | `0c7262cdda4547739ec0c1fa5128fb51` |
| Contact | `ab93d842bf2e49caa838a1fd414eb35b` | `9cbad6aacb6246549913e275f228fa80` | — |
| Giving | `59c8fdedf68a43e3a5d2384b0c2212df` | `a0616f23568c464a95eda9e317e2fa9d` | `a08093b9ec32467bad300ef43ac800fa` |

---

## 2. Files changed

| File | Change |
|------|--------|
| `views/blessboard/v5/public/ministries.ejs` | Soft intro, `hrefFor`, contact email when present, markers, blank filter |
| `views/blessboard/v5/public/events.ejs` | Soft intro, `hrefFor`, list marker, blank title filter |
| `views/blessboard/v5/public/sermons.ejs` | Soft intro, `hrefFor`, list marker, blank title filter |
| `views/blessboard/v5/public/contact.ejs` | Soft intro, office hours section, AM/PM service times, markers |
| `views/blessboard/v5/public/giving.ejs` | Soft intro, testing disclaimer banner, blank method filter |
| `src/blessboard/http/loadTenantPublicPageModel.js` | Page soft-fills; `mapGiving` credential redact; `cssHref?v=35` |
| `public/blessboard/v5/tenant-public.css` | `.bb-tp-contact-hours` |
| Shell / preview | `?v=35` |
| Tests | PHASE2_088 public + frontend-assets |
| `docs/phase2/PHASE2_088_REMAINING_PUBLIC_PAGES_STITCH_PARITY.md` | This doc |

---

## 3. Page sections completed

| Page | Completed |
|------|-----------|
| Ministries | Hero · grid (featured first) · meeting day · contact email · CTA · empty |
| Events | Hero · featured · upcoming list (date/time/location/summary) · empty |
| Sermons | Hero · featured · recent list (title/speaker/date/category/summary/actions) · empty |
| Contact | Hero · service times · office hours · channels/settings · honest non-form CTA · map only when coords |
| Giving | Hero · safety notice (+ testing banner) · methods/instructions · empty · no payment UI |

---

## 4. Data / fallback behavior

- Canonical published entities/sections first.
- Soft demo intros (`*DemoFallback`) only for `testing`/`demo` when page is not empty.
- Ministries “leader”: supported field is **contact email** (no invented leader names).
- Giving: demo instructions may show `DEMO-…` / `TEST ONLY`; non-demo credential-like strings (IBAN/SWIFT/long digit runs) are redacted in `mapGiving`.
- Images: CMS local/safe URLs or icon/gradient placeholders — no Stitch hotlinks.

---

## 5. Desktop / mobile behavior

| | Desktop | Mobile |
|--|---------|--------|
| Ministries | Featured wide card + grid | Stacked cards |
| Events | Featured + multi-col list | Stacked |
| Sermons | Featured + grid | Latest Release label + play affordance |
| Contact | Channels + message/map split | Stacked |
| Giving | Method cards | Stacked; testing disclaimer when env badge |
| Overflow | `overflow-x: clip` / `min-width: 0` | Same at 390 |

---

## 6. Tests and results

```bash
node --test tests/blessboard-v5-frontend-assets.test.js tests/blessboard-public-pages.test.js
```

**Result (2026-07-24):** `# tests 57` · `# pass 57` · `# fail 0`

---

## 7. Remaining blocked items

1. Contact POST / Send a Message form — unsupported.
2. Payment / live Mobile Money checkout — info-only.
3. Events calendar UI — obsolete Stitch; list model only.
4. Sermon series / scripture / duration / thumbnail schema — not invented.
5. Ministry category filters / “Learn More” fake actions / member-count KPI tiles.
6. Map when lat/lng missing — address-only / unavailable copy (honest).
