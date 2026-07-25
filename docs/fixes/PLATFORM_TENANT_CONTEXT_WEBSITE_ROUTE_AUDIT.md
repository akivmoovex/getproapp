# Platform / Tenant Context / Website Route Audit

Date: 2026-07-25  
Environment: `https://blessboard.org` (apex; no wildcard subdomains)

## 1. Role-to-route matrix (expected)

| Route family | Expected role | Organization source | Branch source | Session dependency |
| --- | --- | --- | --- | --- |
| `/admin/...` | `platform_admin` | Path `organizationKey` or repository lookup | Explicit/derived | Must **not** depend on tenant session |
| `/hq/...` | `church_hq_admin` (+ platform with tenant) | Session `organizationId` → catalogue | HQ/primary when needed | Yes (apex session-scoped) |
| `/branch-admin/...` | `branch_admin` | Session `organizationId` → catalogue | Session `branchId` / role branch | Yes |
| `/c/:organizationKey` | public | URL key | Public site config | No |

### Live vs expected (before fix)

| Family | Follows model? | Gap |
| --- | --- | --- |
| `/admin` | Mostly | Checklist still emits `/hq/...` links |
| `/hq` | Partially | Works only when `session.organizationId` resolves catalogue; missing context → generic 503 |
| `/branch-admin` core | **No** | Hard apex reject → 503 for everyone |
| `/branch-admin/website*` | Partially | `unlessTenant` OK, but primaryBranch ignores `session.branchId` |
| `/c/:key` | Yes | Canonical public path |

## 2. Session fields by role

Created by `createV5Session` / `establishBlessBoardSession`:

| Field | HQ admin | Branch admin | Platform admin |
| --- | --- | --- | --- |
| `userId` | yes | yes | yes |
| `organizationId` | from `church_hq_admin` role | from `branch_admin` role | from `platform_admin` role |
| `churchId` | yes (stored; unused by session-scoped loader) | yes | null |
| `branchId` | null | **required** on role | null |
| `organizationKey` | **not stored** | **not stored** | **not stored** |
| Roles | **not stored** (reloaded from `user_roles`) | same | same |

Apex post-login (`resolveApexPostLoginPath`):

- `platform_admin` → `/admin`
- `church_hq_admin` → `/hq`
- **everyone else (incl. branch_admin only)** → `/account` (never `/branch-admin`)

## 3. Tenant-context middleware map

Order on apex (`v5FoundationServer.js`):

1. Tenant host routing (usually unresolved on apex)
2. `loadV5Session`
3. `loadSessionScopedTenantContext` — attaches tenant from **`session.organizationId` only**; catalogue primary/HQ branches; **ignores `session.branchId`**
4. `loadBlessBoardAuthorizationContext`

Apex gates:

| Router | Mode | Authenticated without tenant |
| --- | --- | --- |
| HQ (`hqAdminRoutes`, content HQ, website HQ) | `unlessTenant` | Unavailable / 503 or 404 |
| Branch core (`branchAdminRoutes`) | **hard reject** | 503 always |
| Branch website submissions | `unlessTenant` | 404 unavailable |
| Platform admin | apex + `requirePlatformAdmin` | N/A (no tenant required) |

## 4. Broken navigation map (live symptoms)

| Actor | Action | Destination | Failure |
| --- | --- | --- | --- |
| Platform admin | Service Times | `/hq/content/pages/home` | Session tenant ≠ reviewed org → empty/wrong/unavailable |
| Platform admin | Org/contact/settings checklist | `/hq/settings` | Same |
| Platform admin | Website preview | `/admin/organizations/:key/website-preview` | Org correct; visual delta vs public (draft banner + `editHref` fallback to `/hq/...`) |
| HQ admin | Edit / service times | `/hq/content/pages/home` | Empty if `organizationId` missing or catalogue incomplete |
| Branch admin | `/branch-admin` | hard apex block | 503 “unavailable” with no org/branch data |
| Branch admin | Nav Home | `/branch-admin` | Dead on apex |

## 5. Service-times data source

- Table: `blessboard.page_sections`
- Keys: `section_key` / `section_type` = `service_times`
- Structured entries: `layout_metadata.schema = service_times_v1`
- Editor: HQ `POST /hq/content/pages/home/service-times` (church-wide home)
- **No** platform-admin org-scoped editor exists

## 6. Preview rendering architecture

| Path | Renderer | CSS | Shell |
| --- | --- | --- | --- |
| `/c/:key` | `renderTenantPublicPage` | `tenant-public.css` | `tenant-public-shell-*` |
| `/hq/content/preview/:pageKey` | same | same | preview banner |
| `/admin/organizations/:key/website-preview` | same | same | preview banner |

Distortion causes (not admin CSS bleed):

1. Always `preview: true` → draft model + preview banner vs live public
2. `editHref: null` treated as missing → falls back to `/hq/content/pages/home`
3. Banner copy hardcoded; ignores `bannerLabel`

## 7. Root causes

1. Platform-admin checklist still hard-codes tenant-session `/hq/...` URLs for four items.
2. Apex branch-admin shell uses hard reject; Phase 4 website routes alone use `unlessTenant`.
3. Branch admins never redirected to a working apex branch surface after login.
4. Session-scoped tenant ignores `session.branchId` (always catalogue primary).
5. PA preview forced into draft-preview mode and broken edit-link fallback.
6. Missing tenant context surfaces as generic “unavailable” rather than clear account/setup guidance.

## 8. Exact files involved

- `src/blessboard/services/organizationOnboardingSummaryService.js`
- `src/blessboard/urls/churchUrlHelper.js`
- `src/blessboard/http/loadSessionScopedTenantContext.js`
- `src/blessboard/http/branchAdminRoutes.js`
- `src/blessboard/http/tenantLoginHelpers.js`
- `src/blessboard/http/loadTenantPublicPageModel.js`
- `src/platform/http/platformAdminRoutes.js`
- `views/blessboard/v5/partials/tenant-public-shell-start.ejs`
- `views/blessboard/v5/platform-admin/organization-detail.ejs`

## 9. Recommended minimal fix plan

1. Role-aware website action helper; strip PA → `/hq` checklist links.
2. PA service-times / edit: status-only (no tenant-session edit) until org-scoped editor exists.
3. PA preview: published → public render; draft → preview with suppressed HQ edit link + correct banner.
4. Branch-admin apex: `unlessTenant` + clear missing-context errors; post-login → `/branch-admin`.
5. Session-scoped tenant: honor `session.branchId` when it belongs to the church.
6. HQ/branch missing context: explicit HTML error (not empty dashboard).

## 10. Tests required

See user request items 1–30 (session, PA, HQ, branch, public). Narrow suites first, then related onboarding/auth tests.
