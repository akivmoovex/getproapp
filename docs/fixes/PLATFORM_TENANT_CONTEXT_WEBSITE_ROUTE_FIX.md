# Platform / Tenant Context / Website Route Fix

Date: 2026-07-25  
Environment: `https://blessboard.org` (apex; no wildcard subdomains)  
Related audit: `docs/fixes/PLATFORM_TENANT_CONTEXT_WEBSITE_ROUTE_AUDIT.md`

## Verdict

**FIXED_WITH_DOCUMENTED_LIMITATIONS** — code and automated tests address the tenant-context and navigation defects. Live browser verification on blessboard.org was **not** performed in this change set (requires deploy).

## Root causes

1. Platform-admin Foundation checklist still emitted tenant-session `/hq/...` URLs for Service Times and related settings items.
2. Apex `/branch-admin` core shell was hard-rejected (or redirected to a dead surface); branch admins were sent to `/account` after login.
3. Session-scoped tenant loader ignored `session.branchId`, always using catalogue primary branch.
4. Platform-admin website preview always used draft preview chrome and treated `editHref: null` as “missing,” falling back to `/hq/content/pages/home`.
5. Missing tenant context on HQ/branch surfaces rendered generic “unavailable” (or risked empty shells) instead of a clear account/setup error.

## Final tenant-context model

| Route family | Org source | Branch source | Session |
| --- | --- | --- | --- |
| `/admin/...` | URL `organizationKey` / DB | derived for preview only | platform session; **no** tenant org required |
| `/hq/...` | `session.organizationId` → catalogue | HQ/primary (catalogue) | required |
| `/branch-admin/...` | `session.organizationId` → catalogue | `session.branchId` if active for church, else primary | required |
| `/c/:organizationKey` | URL key | public site config | none |

No casual impersonation: platform admin never writes a reviewed org into the normal tenant session.

## Session changes

- Unchanged storage shape: `userId`, `organizationId`, `churchId`, `branchId` (roles still loaded from DB).
- `establishBlessBoardSession` already prefers HQ/branch roles and copies `branch_id` from the preferred role.
- Apex post-login: `branch_admin` → `/branch-admin` (safe next path restricted to `/branch-admin...`).
- `loadSessionScopedTenantContext` honors `session.branchId` only when the branch is **active** and belongs to the session org’s church.

## Route / gate changes

- Branch-admin core: `unlessTenant` + clear 403 when authenticated without resolved tenant; login redirect when unauthenticated.
- HQ shell and content admin (HQ + branch variants): same clear missing-context behavior; branch content uses `unlessTenant` on apex (aligned with branch-admin website routes).
- Platform-admin preview: org by key; published sites render like `/c/:key`; drafts keep preview banner without HQ edit link.

## Link changes

Canonical helper: `src/blessboard/urls/websiteActionUrls.js` → `resolveWebsiteActionUrls`.

Platform-admin checklist:

- Org / branch / contact: **no** action URLs (status only).
- Service times: **no** edit URL; status + HQ-admin guidance copy.
- Preview: `/admin/organizations/:key/website-preview`.
- Publish complete: `/c/:key` (“View published website”).

## Preview rendering solution

Dedicated full-page public renderer (`renderTenantPublicPage` + `tenant-public.css`), not inside the platform-admin chrome.

- Published: `preview: false` (same as public).
- Draft: preview banner with Back to org detail; `editHref: null` respected (no HQ fallback).

## Service-times solution

- Data: `blessboard.page_sections` on home (`service_times` / related keys + `service_times_v1` metadata).
- Platform admin: status-only (no cross-tenant editor; no impersonation).
- HQ admin: `/hq/content/pages/home` (service-times section in content editor).
- Branch admin: `/branch-admin/website` Phase 4 workflow (not empty HQ editor).

## Branch-admin solution

- Apex login → `/branch-admin`.
- Session org + branch resolve via session-scoped middleware.
- Website actions stay under `/branch-admin/website*` / content branch routes.

## Final actor → route matrix

| Actor | Service Times | Edit Website | Preview | Published |
| --- | --- | --- | --- | --- |
| Platform admin | *(none — status only)* | *(hidden)* | `/admin/organizations/:key/website-preview` | `/c/:key` |
| HQ admin | `/hq/content/pages/home` | `/hq/content/pages/home` | `/hq/content/preview/home` | `/c/:key` |
| Branch admin | `/branch-admin/website` | `/branch-admin/website` | `/branch-admin/website` | `/c/:key` |

## Security considerations

- No query/body tenant switching.
- Branch id from session only; validated against church ownership + `active`.
- Platform preview requires platform admin + apex; resolves org by key independently of any tenant session.
- No new impersonation model.

## Files changed

- `docs/fixes/PLATFORM_TENANT_CONTEXT_WEBSITE_ROUTE_AUDIT.md` (Phase A)
- `docs/fixes/PLATFORM_TENANT_CONTEXT_WEBSITE_ROUTE_FIX.md` (this file)
- `src/blessboard/urls/websiteActionUrls.js` (new)
- `src/blessboard/services/organizationOnboardingSummaryService.js`
- `src/blessboard/http/loadSessionScopedTenantContext.js`
- `src/blessboard/http/tenantLoginHelpers.js`
- `src/blessboard/http/branchAdminRoutes.js`
- `src/blessboard/http/hqAdminRoutes.js`
- `src/blessboard/http/contentAdminRoutes.js`
- `src/blessboard/http/loadTenantPublicPageModel.js`
- `src/platform/http/platformAdminRoutes.js` (website-preview)
- `views/blessboard/v5/partials/tenant-public-shell-start.ejs`
- `tests/blessboard-tenant-context-website-routes.test.js` (new)
- `tests/blessboard-foundation-checklist-public-links.test.js`
- `tests/blessboard-admin-onboarding-support.test.js`

## Tests and results

Narrow:

```bash
NODE_ENV=test node --test --test-concurrency=1 \
  tests/blessboard-tenant-context-website-routes.test.js \
  tests/blessboard-foundation-checklist-public-links.test.js \
  tests/blessboard-admin-onboarding-support.test.js
```

**24 pass / 0 fail** (6 suites).

Broader:

```bash
NODE_ENV=test node --test --test-concurrency=1 \
  tests/blessboard-branch-admin-shell.test.js \
  tests/blessboard-hq-shell.test.js \
  tests/blessboard-content-admin.test.js \
  tests/blessboard-registration-public-miniwebsite.test.js
```

**46 pass / 0 fail** (4 suites).

## Migration requirement

**None.** No schema change required.

## Deployment steps

1. Deploy application build that includes the files above.
2. Restart Node workers so middleware/route changes load.
3. No DB migrate / repair required for this fix alone.
4. Smoke-check apex login for HQ and branch_admin, plus PA org `demo3` preview and `/c/demo3`.

## Manual test checklist (post-deploy)

1. Platform admin → organization `demo3`
2. Platform admin → website preview (compare to public; no admin CSS bleed; no HQ edit)
3. Platform admin → `/c/demo3` published site
4. Platform admin → Service Times shows status only (no `/hq/...` link)
5. HQ admin login → `/hq` with church data
6. HQ admin → `/hq/content/pages/home` with church + service times editor
7. Branch admin login → `/branch-admin`
8. Branch admin → org name + branch name visible
9. Branch admin → `/branch-admin/website` (not empty HQ editor)
10. Public → `/c/demo3`

## Remaining limitations

- No platform-admin cross-tenant **editor** for service times or website (by design; avoid insecure impersonation).
- Service Times for HQ still opens the full home content editor (not a dedicated `#service-times` deep-link URL), though the section exists on that page.
- Branch “preview” points at the branch website workflow overview, not a full draft public render (Phase 4 model).
- Live production verification is pending deploy + browser check.
