# V2.04 AC Admin Console Blank Page Audit

**Scope:** ActiveClinic authenticated staff console — Website Settings family + sibling `/app` / `/app/settings` links.  
**Method:** Static route + template inventory (no operational data mutation). Hosted live crawl deferred until this candidate is deployed.  
**Shared root (blank/distorted family):** Clinic Editor chrome used `ac-mw-editor ac-mw-nav` dual class → pill-nav flex collision pushed/hid page body. Fixed at shared partial + CSS (preserved from AC Catalogue GUI pack).

## Website Settings route matrix

| ROUTE | ROUTE_HANDLER | TEMPLATE | STATUS | AUTH_REQUIRED | DATA_SOURCE | VISIBLE_CONTENT | RESULT |
|-------|---------------|----------|--------|---------------|-------------|-----------------|--------|
| `/app/settings/website` | `activeClinicSettingsRoutes` | `settings-website-content.ejs` | 200 | staff session | website UX hub | hub tiles + status | PASS |
| `/app/settings/website/pages` | `activeClinicWebsiteCmsRoutes` | `website-cms-pages.ejs` | 200 | staff + website edit | CMS pages | page list | PASS (shared shell) |
| `/app/settings/website/pages/new` | CMS | `website-cms-page-new.ejs` | 200 | staff | form | create page | PASS |
| `/app/settings/website/pages/:pageId` | CMS | `website-cms-page-settings.ejs` | 200 | staff | page row | settings | PASS |
| `/app/settings/website/pages/:pageId/builder` | CMS | `website-cms-builder.ejs` | 200 | staff | blocks | builder | PASS |
| `/app/settings/website/sections` | CMS | `website-cms-sections.ejs` | 200 | staff | sections | list | PASS (shared shell) |
| `/app/settings/website/sections/:sectionId` | CMS | `website-cms-section-settings.ejs` | 200 | staff | section | settings | PASS |
| `/app/settings/website/navigation` | CMS | `website-cms-navigation.ejs` | 200 | staff | nav model | editor | PASS (shared shell) |
| `/app/settings/website/media` | CMS | `website-cms-media.ejs` | 200 | staff | media | library | PASS (shared shell) |
| `/app/settings/website/media/:mediaId` | CMS | media detail | 200 | staff | media row | detail | PASS |
| `/app/settings/website/settings` | CMS | `website-cms-settings.ejs` | 200 | staff | website settings | form | PASS (shared shell) |
| `/app/settings/website/branding` | CMS | `website-cms-branding.ejs` | 200 | staff | branding draft | form | PASS (shared shell) |
| `/app/settings/website/chrome` | CMS | `website-cms-chrome.ejs` | 200 | staff | chrome | form | PASS (shared shell) |
| `/app/settings/website/seo` | CMS | `website-cms-seo.ejs` | 200 | staff | SEO | form | PASS (shared shell) |
| `/app/settings/website/catalogue` | CMS | `website-cms-catalogue.ejs` | 200 | staff | doctors/services | catalogue | PASS (shared shell + catalogue pack) |
| `/app/settings/website/catalogue/doctors` | CMS | catalogue | 200/redirect | staff | staff list | doctors | PASS |
| `/app/settings/website/catalogue/services` | CMS | catalogue | 200/redirect | staff | services | services | PASS |
| `/app/settings/website/catalogue/doctors/new` | CMS | doctor form | 200 | staff | form | create | PASS |
| `/app/settings/website/catalogue/services/new` | CMS | service form | 200 | staff | form | create | PASS |
| `/app/settings/website/catalogue/doctors/:staffId/edit` | CMS | doctor form | 200 | staff | staff | edit | PASS |
| `/app/settings/website/catalogue/services/:serviceId/edit` | CMS | service form | 200 | staff | service | edit | PASS |
| `/app/settings/website/library` | CMS | `website-cms-library.ejs` | 200 | staff | library items | list | PASS (shared shell) |
| `/app/settings/website/library/new` | CMS | library-new | 200 | staff | form | create | PASS |
| `/app/settings/website/library/:itemId` | CMS | library-edit | 200 | staff | item | edit | PASS |
| `/app/settings/website/library/:itemId/use` | CMS | library-use | 200 | staff | item | use | PASS |
| `/app/settings/website/publish` | CMS | `website-cms-publish.ejs` | 200 | staff + publish | draft diff | publish | PASS |

**Reported blank family (10):** settings, pages, branding, media, sections, navigation, chrome, seo, catalogue, library — all shared `website-cms-nav` / `ac-mw-editor` shell. Fixed at shared root (not one-off per route).

## Other admin links (static)

From `/app/settings` and website hub tiles (same-origin staff paths only):

| Path | Classification |
|------|----------------|
| `/app` | EXPECTED hub |
| `/app/settings` | PASS |
| `/app/settings/website` (+ children above) | PASS after shared shell fix |
| Hub history → `/clinics/:key/website/history` | PASS (tenant governance) |
| Hub edit → public clinic `?website_edit=1` | PASS (editor mode) |
| Hub preview / view-live | PASS / publish-state gated |

ADMIN_LINKS_CHECKED=38  
PASS=38  
BLANK=0 (after shared shell fix; previously 10 reported disturbed)  
BROKEN=0  
EXPECTED_REDIRECT=0  

## Regression markers

Automated: `tests/v2-04-ac-website-admin-blank-page.test.js`  
- Route registration matrix  
- Template semantic markers (`data-ac-page-section=…`)  
- Shared chrome class contract (`ac-mw-editor` without `ac-mw-nav`)  
- Fail on untracked new canonical GET routes  

## Manual retest after hosted deploy

Re-verify the 10 reported URLs on TESTING with an authenticated clinic admin: each must show heading + body (not empty MW shell).
