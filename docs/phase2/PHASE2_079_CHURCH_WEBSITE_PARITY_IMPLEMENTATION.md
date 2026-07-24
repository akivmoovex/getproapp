# PHASE2_079 — Church website preview/published parity (Stitch)

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 church public mini-site preview + published UI only  
**Stitch SoT:** `projects/17124191473876947591` (Sacred Modernity)  
**Depends on:** `PHASE2_077` audit, `PHASE2_078` testing demo content seed

## Goal

Make authenticated content preview and published church mini-sites use the **same renderer and data mapping**, with rich home teasers and section layouts aligned to Stitch desktop/mobile screens — without leaking drafts publicly or inventing metrics.

## What changed

### Shared renderer + draft-aware model

- `loadTenantPublicPageModel({ preview: true })` loads draft|published admin bundles and entity lists for authenticated preview.
- Published mode remains published-only (`publicContentReadService`).
- Preview skips the unpublished-site gate (still blocks suspended sites for public).
- Preview returns `isPreview` + `previewMeta` for the admin banner.
- `mapSection` preserves sanitized `layoutMetadata` so service-times entries render.
- Sermon summaries support `Category: …` prefix parsing for display.
- Home model adds `homeTeasers` (ministries, leaders, events, sermons, announcement highlight), `socialLinks`, and `serviceTimesEntries`.
- About/contact reuse home service-times when the about/contact page has none.

### Preview route

- `GET …/content/preview/:pageKey` (HQ + branch-admin) now calls `loadTenantPublicPageModel` + `renderTenantPublicPage` (same `public/*.ejs` as live).
- Legacy `content-admin/preview.ejs` is obsolete (kept only for historical asset references).

### Shell

- Preview banner (`data-bb-preview-banner`) on `tenant-public-shell-start`.
- Footer social links from contact channels.
- CSS cache bust: `tenant-public.css?v=31`.

### Home

Stitch-shaped composition with CMS + live teasers:

- Hero (desktop/mobile eyebrow + CTA splits)
- Service times (metadata entries)
- Announcement highlight
- Welcome/body sections (blank sections collapse)
- Ministries / leadership / events / sermons teasers
- Give + Visit/contact CTA cards
- Explore shortcuts + member band  
No fabricated member counts or prayer/newsletter widgets.

### About / Contact / directories

- About: story, mission, vision, values + service information strip.
- Contact: channels, address, office-hours section (when seeded), service times strip, message CTA (no form).
- Leadership / ministries / events / sermons / giving: existing Stitch templates; sermons show category when present; giving keeps payment disclaimer.

### Demo content (078 extension)

- Home `announcement_highlight` section added to testing demo seed so the home announcement band is populated on `automated-test-church`.

## Preview vs published parity

| Concern | Behavior |
|---------|----------|
| Templates | Same `public/*.ejs` + shell |
| Draft sections/entities | Preview: yes · Public: no |
| Preview banner | Preview only |
| Admin chrome | Never on public |
| Unpublished site | Public → setup/unavailable · Preview → still renders drafts when allowed |
| Empty fields | Collapse; no blank cards; no fake counts |

## Mobile

Responsive shell already matches Stitch pairs (eyebrow/CTA splits, drawer nav). CSS adds compact preview banner, stacked teaser headers, single-column service-time rows, overflow-x clip on `body.bb-tp-body`.

## Tests

- Extended `tests/blessboard-public-pages.test.js` (home teasers, about services, empty collapse, sermon category, layout metadata, desktop/mobile markers, V4 untouched).
- Preview assertions in `tests/blessboard-content-admin.test.js`.
- Asset version / preview path in `tests/blessboard-v5-frontend-assets.test.js`.

## Blocked / out of scope

- HQ website dashboard / Stitch page-editor dual-pane chrome (077 batches 1–2).
- Real CMS media upload beyond existing assets (078 uses static `/church/images/…`).
- Member-portal announcements ≠ public home highlight (separate products).
- V4 `views/church/public/*` intentionally unchanged.
