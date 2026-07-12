# BlessBoard directory — SEO notes (internal)

**Status:** Internal product/SEO guidance for blessboard.com church finder routes.

---

## Current behavior (launch)

| Route | Indexable | Canonical | Notes |
|-------|-----------|-----------|-------|
| `/churches` (default listing) | Yes | `https://blessboard.com/churches` | Main finder entry |
| `/churches?q=…` | No | `/churches` | Search results — thin/variable |
| `/churches?page=N` (N > 1) | No | `/churches` | Pagination |
| `/churches?for=admin` | No | `/churches` | Administrator intent duplicate |
| `/churches/:slug` (org picker) | No | `/churches` | Branch selection only — minimal unique content |
| `/churches/:slug` (404/503 errors) | No | — | Error states |

Tenant public church websites (`https://{branch}.blessboard.com/…`) remain **indexable** with self-referencing canonicals. They are **not** listed in the apex marketing sitemap.

---

## Why `/churches/:slug` stays noindex for now

Organization picker pages typically show:

- Church name
- Branch list with links to tenant subdomains
- Sign-in / open-branch actions

They do **not** currently provide substantial unique public content (no dedicated org description, service times, media, or contact blocks on the apex host). Indexing them would create thin duplicate URLs competing with tenant sites.

---

## Content required before making org pages indexable

Consider enabling index when **most** of the following exist for a public organization record:

1. **Unique public description** — approved org summary (not duplicated from tenant homepage).
2. **Location context** — city/region/country shown on the apex listing page.
3. **Stable public metadata** — dedicated title and meta description per organization.
4. **Branch summary** — service times or “primary branch” snippet where applicable.
5. **Canonical policy** — either self-referencing `/churches/:slug` **or** a clear primary branch URL; avoid indexing both apex org page and branch homepage for the same content.
6. **Sitemap strategy** — optional org URLs in apex sitemap or explicit `lastmod` from directory data.

Until then, keep `noindex` and canonical to `/churches` as implemented in `src/routes/church/publicChurchDirectory.js`.

---

## Related code

- Apex SEO: `src/church/platformPublicSeo.js`
- Directory routes: `src/routes/church/publicChurchDirectory.js`
- Tenant SEO: `src/church/churchTenantPublicSeo.js`
