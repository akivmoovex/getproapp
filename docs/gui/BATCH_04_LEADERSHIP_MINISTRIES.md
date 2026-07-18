# Batch 04 — Tenant public Leadership and Ministries

**Date:** 2026-07-18  
**Scope:** `/leadership` and `/ministries` only (tenant public shell CSS bump shared)  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_03_TENANT_HOME_ABOUT.md`](./BATCH_03_TENANT_HOME_ABOUT.md)

## 1. Canonical Stitch screen IDs

| Screen | Desktop | Mobile | Exact titles |
|--------|---------|--------|--------------|
| Leadership | `372faa60f8df4983b627db3cb5d35f9d` | `0f4e816fd64d4592bd3677fbde3b7544` | `03-public-leadership-desktop-v2 (Populated)` / `03-public-leadership-mobile-v4 (Restored)` |
| Leadership empty | `5f7b1d44bd454d45a0b72fb76d94bbd0` | — | `03-public-leadership-desktop-v2 (Empty)` |
| Ministries | `f146cdccadb34ff3bd8b0b75a0450d15` | `d2fd7ecc586541d3beb5d0d3bed98d56` | `04-public-ministries-desktop-v4 (Populated)` / `04-public-ministries-mobile-v4 (Populated)` |

Obsolete IDs **not** used: base leadership frames, duplicate mobile v2 populated IDs, ministries v3.

## 2. Files changed

| Area | Path |
|------|------|
| Leadership | `views/blessboard/v5/public/leadership.ejs` |
| Ministries | `views/blessboard/v5/public/ministries.ejs` |
| CSS | `public/blessboard/v5/tenant-public.css` (`?v=12`) |
| Shell default CSS href | `views/blessboard/v5/partials/tenant-public-shell-start.ejs` |
| Model cache bump | `src/blessboard/http/loadTenantPublicPageModel.js` |
| Tests | `tests/blessboard-public-pages.test.js` |
| Doc | `docs/gui/BATCH_04_LEADERSHIP_MINISTRIES.md` |

**Unchanged:** routes, publication queries, hostname resolution, Home/About markup (shell CSS version only).

## 3. Data sources

| Surface | Fields |
|---------|--------|
| Page intro | Published page sections: `heading`, `bodyText`, `mediaUrl` |
| Leaders | `displayName`, `roleTitle`, `biography`, `imageUrl` (published, `sort_order` ASC) |
| Ministries | `name`, `summary` / `description`, `meetingDay`, `contactEmail` / `contactHref`, `imageUrl` (published, `sort_order` ASC) |
| Empty | `showEmptyState`, `emptyHeadline`, `emptyMessage` |

Featured leader = **first published leader by sort order** (no pastor/role inference).

## 4. Images and fallbacks

| Case | Treatment |
|------|-----------|
| Leader / ministry with `imageUrl` | Safe CMS media URL |
| Leader without photo | Initials avatar (`.bb-tp-avatar`) |
| Ministry without image | Material `groups` icon on mesh fallback |
| Stitch remote assets | Inspected only — not hotlinked |

## 5. Empty states

| Page | UI |
|------|----|
| Leadership | Split empty card + “Update in progress” badge + Contact / About |
| Ministries | Same pattern + Contact / Register |

No placeholder people, fake ministries, or fabricated “Community Led / Live Updates” copy from Stitch empty chrome.

## 6. Intentional deviations

1. No Contact Pastor / View Profile / Learn More / Join Team / View Schedule.  
2. No Pastoral Team / Elders / Ministry Leads **grouping by inferred role** — flat sort order only.  
3. No ministry category filter chips (no category field in schema).  
4. No stats bar (500+ members, missions, etc.).  
5. CTAs map to real routes: `/contact`, `/about`, `/ministries`, `/events`, `/register`.  
6. Mobile bottom-tab chrome omitted (tenant drawer shell).  
7. Sacred Modernity violet + Hanken (not Stitch Inter).

## 7. Responsive status

| Width | Notes |
|-------|-------|
| 375px | Leadership stacked; ministries list layout (thumb + copy) |
| 768px | Featured leader two-column; cards 2-col; featured ministry spans |
| 1440px | Leader grid up to 4-col; ministry grid 3-col |
| 320px | Existing shell overflow guards; card `min-width: 0` / `overflow-wrap` |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **24/24 pass** |
| `npm run test:blessboard:tenant-routing` | **44/44 pass** |
| `npm run test:blessboard:a11y-structure` | **15/15 pass** |
| `npx stylelint public/blessboard/v5/tenant-public.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 9. Remaining gaps

- Leadership department/group sections need schema if product wants Stitch Pastoral/Elders grouping.  
- Ministry category filters need a category field.  
- Empty mobile leadership has no dedicated Stitch empty frame.  
- Events / Sermons are Batch 5.

## 10. Suggested commit message

```
Align public leadership and ministries pages with canonical Stitch pairs.
```
