# V2.04 Website Management Feature Matrix

**Products:** ActiveClinic + BlessBoard  
**Source of truth:** `src/platform/website/websiteManagementFeatureContract.js`  
**Date:** 2026-10-02

## Shared platform features

| FEATURE_ID | LABEL | CATEGORY |
|------------|-------|----------|
| WM_HUB | Website Management Hub | shell |
| WM_DRAFT | Draft state | lifecycle |
| WM_SAVE | Save draft | lifecycle |
| WM_PREVIEW | Preview draft | lifecycle |
| WM_PUBLISH | Publish | lifecycle |
| WM_UNPUBLISH | Unpublish | lifecycle |
| WM_HISTORY | Version history | lifecycle |
| WM_VERSION_PREVIEW | Old version preview | lifecycle |
| WM_RESTORE | Restore-as-new | lifecycle |
| WM_MEDIA | Media library | media |
| WM_BRANDING | Branding | appearance |
| WM_SEO | SEO | appearance |
| WM_STYLES | Styles / theme | appearance |
| WM_VIEWPORT | Responsive editor viewport | editor |
| WM_INLINE | Inline editing | editor |
| WM_CHANGE_MANAGER | Change Manager | editor |
| WM_TENANT_ISOLATION | Tenant isolation | security |
| WM_RBAC | Website RBAC | security |

**SHARED_PLATFORM_FEATURES=18**

## ActiveClinic Website Management options

Starting hub: `/app/settings/website`

| FEATURE_ID | LABEL | ROUTE | TEMPLATE | STATUS |
|------------|-------|-------|----------|--------|
| AC_HUB | Overview | `/app/settings/website` | `settings-website-content.ejs` | FULL |
| AC_SETTINGS | Website Settings | `/app/settings/website/settings` | `website-cms-settings.ejs` | FULL |
| AC_PAGES | Pages | `/app/settings/website/pages` | `website-cms-pages.ejs` | FULL |
| AC_SECTIONS | Sections | `/app/settings/website/sections` | `website-cms-sections.ejs` | FULL |
| AC_NAVIGATION | Navigation | `/app/settings/website/navigation` | `website-cms-navigation.ejs` | FULL |
| AC_CHROME | Header & Footer | `/app/settings/website/chrome` | `website-cms-chrome.ejs` | FULL |
| AC_BRANDING | Brand & Appearance | `/app/settings/website/branding` | `website-cms-branding.ejs` | FULL |
| AC_MEDIA | Media Library | `/app/settings/website/media` | `website-cms-media.ejs` | FULL |
| AC_LIBRARY | Content Library | `/app/settings/website/library` | `website-cms-library.ejs` | FULL |
| AC_SEO | SEO & Social | `/app/settings/website/seo` | `website-cms-seo.ejs` | FULL |
| AC_CATALOGUE | Public Catalogue | `/app/settings/website/catalogue` | `website-cms-catalogue.ejs` | FULL |
| AC_PUBLISH | Publishing | `/app/settings/website/publish` | `website-cms-publish.ejs` | FULL |

**AC_WEBSITE_OPTIONS=12** (canonical hub-linked). Nested builders/forms exist but are children of these options.

**AC-specific:** Services / Doctors catalogue (C01/C02/E03).

## BlessBoard Website Management options

Starting hub: `/hq/website`

| FEATURE_ID | LABEL | ROUTE | STATUS |
|------------|-------|-------|--------|
| BB_HUB | Website Management Hub | `/hq/website` | FULL |
| BB_BRANDING | Branding | `/hq/website/branding` | FULL |
| BB_SETTINGS | Advanced settings | `/hq/website/advanced` | PARTIAL |
| BB_PUBLISH_REVIEW | Publish review | `/hq/website/publish/review` | FULL |
| BB_HISTORY | Version history | `/hq/website/version-history` | FULL |
| BB_MEDIA | Media | `/hq/content/media` | FULL |
| BB_CLASSIC_PAGES | Classic pages CMS | `/hq/content` | FULL |
| BB_LEADERSHIP | Leadership | `/hq/content/pages/leadership` | FULL |
| BB_MINISTRIES | Ministries | `/hq/content/pages/ministries` | FULL |
| BB_EVENTS | Events | `/hq/content/pages/events` | FULL |
| BB_SERMONS | Sermons | `/hq/content/pages/sermons` | FULL |
| BB_GIVING | Giving | `/hq/content/pages/giving` | FULL |

**BB_WEBSITE_OPTIONS=12**

**BB-specific:** Leadership, Ministries, Events, Sermons, Giving (not forced into AC).

## Feature parity

| FEATURE | PLATFORM_COMMON | AC | BB | PARITY_STATUS |
|---------|-----------------|----|----|---------------|
| Website Hub | YES | FULL | FULL | PARITY |
| General Settings | YES | FULL | PARTIAL | PARITY |
| Pages | YES | FULL | PARTIAL | PARITY |
| Sections | YES | FULL | PARTIAL | PARITY |
| Navigation | NO | FULL | — | **AC_ONLY_BY_DESIGN** |
| Header/Footer Chrome | NO | FULL | — | **AC_ONLY_BY_DESIGN** |
| Branding | YES | FULL | FULL | PARITY |
| Media | YES | FULL | FULL | PARITY |
| Content Library | NO | FULL | PARTIAL (media reuse) | **PRODUCT_SPECIFIC** |
| SEO | YES | FULL | FULL | PARITY |
| Lifecycle (draft→republish) | YES | FULL | FULL | PARITY |
| Responsive viewport | YES | FULL | FULL | PARITY |
| Catalogue Services/Doctors | NO | FULL | — | **PRODUCT_SPECIFIC** |
| Leadership/Ministries/… | NO | — | FULL | **PRODUCT_SPECIFIC** |

### BB gaps fixed this pack

| Gap | Class | Fix |
|-----|-------|-----|
| Hub missing Branding / Library / Settings tiles despite shared UX actions | A — shared capability not exposed | Added tiles in `website-management.ejs` |

### Deferred product differences

- AC Navigation manager / Chrome screens — not mirrored into BB (template + inline fields).
- AC Content Library CMS items — BB uses media library reuse, not CMS content items.
- Domain catalogues remain product-owned.

## Architecture target

```
PLATFORM: websiteManagementFeatureContract + presentation + engine + lifecycle + viewport + media
AC adapter: clinic CMS routes, Services/Doctors, AC tokens
BB adapter: HQ hub, classic CMS pages, Leadership/…, BB tokens
```

Do **not** merge product design tokens.
