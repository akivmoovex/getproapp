# Batch 06A — Tenant public Contact

**Date:** 2026-07-18  
**Scope:** Tenant public `/contact` only. Shell untouched except CSS cache bump. **Giving not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 20), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_05B_SERMONS.md`](./BATCH_05B_SERMONS.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Contact | `08-public-contact-desktop-v2 (Populated)` | `ab93d842bf2e49caa838a1fd414eb35b` |
| Mobile Contact | `08-public-contact-mobile-v2 (Populated)` | `9cbad6aacb6246549913e275f228fa80` |

Obsolete IDs **not** used: contact base (`6d4d6ae2…`, `8f6f1528…`).

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/public/contact.ejs` | Hero eyebrows, channel/settings cards, message panel, map aside |
| `public/blessboard/v5/tenant-public.css` | Contact hero; mobile list cards; desktop 3-col; form+map split |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `cssHref` `?v=23` only |
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | Default CSS href `?v=23` (cache bump only) |
| `tests/blessboard-public-pages.test.js` | Contact render, channels, map, form/CSRF absence |
| `tests/blessboard-v5-a11y-structure.test.js` | Contact structure + omitted hours/POST |
| `docs/gui/BATCH_06A_CONTACT.md` | This document |

**Unchanged:** Contact GET route, `buildPublicContact` / `mapContact` / `safeExternalUrl`, hostname resolution, auth, Sermons markup, Giving interiors. **No new POST / submission workflow.**

## 3. Data fields used

| Surface | Fields |
|---------|--------|
| Hero / intro | First published page section: `heading`, `bodyText` (lead only when present) |
| Channels | Published `entities[]`: `label`, `value`, `channelType`, safe `href`, `icon` |
| Settings fallbacks | Branch-first then church: `email` / `emailHref`, `phone` / `phoneHref`, `addressLines` / `addressText` |
| Map | `hasMap`, `mapEmbedUrl`, `directionsUrl`, `latitude` / `longitude` (via `validCoordinates`) |
| Empty | `showEmptyState`, `emptyHeadline`, `emptyMessage` |
| Brand fallback | `pageTitle` / “Contact Us” when no intro heading |

Phone, email, address, and map render **only when configured**. No invented numbers, hours, or locations.

## 4. Form behavior

| Item | Behavior |
|------|----------|
| Stitch “Send a Message” chrome | Section heading + designed unavailable panel (`data-bb-contact-form="unavailable"`) |
| Form method / fields / CSRF | **None** — V5 has no public contact POST route; current GET-only behavior preserved |
| Submission workflow | **Not added** |
| Email CTA | `mailto:` via `contact.emailHref` when a configured email exists |
| Secondary CTA | View Events → `/events` |

Form/CSRF tests assert absence of `<form>`, `name="_csrf"`, and message field names on `/contact`.

## 5. Map behavior

| Case | Treatment |
|------|-----------|
| Valid branch lat/lng | OSM embed iframe + Get Directions (`target="_blank"`, `rel="noopener noreferrer"`) |
| Address without coordinates | Address still on cards; `data-bb-contact-map="unavailable"` status |
| No address / no coords | Map block omitted |
| Directions URL only | Primary Get Directions button (no iframe) |

## 6. Link semantics

| Kind | Treatment |
|------|-----------|
| Email | `mailto:` via `safeExternalUrl`; `aria-label="Email …"` |
| Phone | `tel:` (digits + optional `+`); `aria-label="Call …"` |
| HTTPS channel | `rel="noopener noreferrer"` |
| Directions | New-tab OSM link with accessible label |

## 7. Intentional deviations from Stitch

1. **No interactive message form** — unsupported in V5; unavailable panel instead.  
2. **No Service Times / Office Hours** — no public hours schema.  
3. **No newsletter / Stay Connected** chrome.  
4. **No fabricated card blurbs** (“within 24 hours”, “office hours for immediate assistance”).  
5. **Nav** — full V5 CMS nav vs Stitch short mock nav (shell).  
6. **Mobile bottom-tab** — omitted (drawer shell).  
7. **Primary** — Sacred Modernity `#6C5CE7` + Hanken Grotesk.

## 8. Responsive status

| Width | Notes |
|-------|-------|
| 320px | Existing overflow guards; card `min-width: 0` |
| 375px | Contact Us eyebrow; horizontal channel rows; stacked message + map |
| 640px | Contact cards 2-col |
| 768px | Connect With Us eyebrow; 3-col centered cards; message + map split |
| 900px+ | Taller map iframe |
| 1440px | Max width + gutter token |

## 9. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **29/29 pass** (route/render, channels, map, form/CSRF absence) |
| `npm run test:blessboard:a11y-structure` | **28/28 pass** |
| `npx stylelint public/blessboard/v5/tenant-public.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 10. Remaining gaps

1. A real contact form needs an explicit product POST route + CSRF + storage before Stitch field parity.  
2. Service / office hours need a published settings field.  
3. Giving page interior is **Batch 06B / next** — not this batch.

## 11. Suggested commit message

```
Align tenant public Contact with canonical Stitch desktop and mobile.
```
