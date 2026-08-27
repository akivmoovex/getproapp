# Hosted website QA personas (V7 testing)

Readiness contract for browser QA of the shared website engine on the **hosted
testing** deployment. Verified end to end on 2026-08-27 against hosted build
`377f8c09024f`.

**No passwords, tokens, or connection strings appear in this document.** The
credential mechanism is named; the values live only in the seeder invocation
documented in `docs/blessboard/BLESSBOARD_QA_ROLE_USERS.md`.

## Verdict

| Persona | Ready | Sign-in URL | Lands on |
|---|---|---|---|
| BlessBoard HQ admin | **YES** | `https://blessboard.pronline.org/login` | `/hq` |
| BlessBoard branch admin (multi-branch church) | **YES** | `https://blessboard.pronline.org/login` | `/branch-admin` |
| ActiveClinic clinic admin | **YES** | `https://activeclinic.pronline.org/login` | `/app` |

45/45 database readiness checks pass, all three sign-ins succeed against the
hosted app, and every website surface QA needs returns HTTP 200. One known
product issue affects a single navigation link and has a verified workaround —
see [Known issues](#known-issues).

## Environment

| Item | Value |
|---|---|
| Deployment code | `moovex-platform-testing` |
| Environment | `testing` |
| Database identity | `moovex-platform-v7` (`platform.database_identity.environment_code = testing`) |
| Hosted build (`/healthz` `gitSha`) | `377f8c09024f` — matches `V7` HEAD |
| Session cookie | `moovex_platform_testing_sid` |
| CSRF cookie | `moovex_platform_testing_csrf` |
| BlessBoard host | `blessboard.pronline.org` |
| ActiveClinic host | `activeclinic.pronline.org` |

Production was not touched. Every script below refuses to run unless
`DEPLOYMENT_ENV=testing` **and** the connected database reports identity
`moovex-platform-v7` with `environment_code=testing`.

### Pre-QA gate

Run this first each morning; QA is only valid if both endpoints report the SHA
you expect to be testing:

```bash
curl -s https://blessboard.pronline.org/healthz
curl -s https://activeclinic.pronline.org/healthz
```

Require `ok: true`, `environment: testing`, `deploymentCode: moovex-platform-testing`,
`schemaCompatible: true`.

## How tenant context works on the hosted app (read this first)

There are **no per-tenant hostnames** in testing, and adding one is not a
database-only change — `src/platform/config/canonicalHostRegistry.js` is an
exact-match allowlist compiled into the source, so an unlisted host returns
`UNKNOWN_PLATFORM_HOST` regardless of what `platform.domains` says. The single
existing domain row (`demo-church.blessboard.test`) is a non-resolvable reserved
TLD pointing at a retired deployment code; **ignore it**.

Instead, BlessBoard admin surfaces work on the apex host via
`src/blessboard/http/loadSessionScopedTenantContext.js`, which derives the tenant
from the **signed session's organization** once the actor has signed in. Practical
consequences for QA:

- Sign in at `https://blessboard.pronline.org/login`, then navigate to `/hq` or
  `/branch-admin`. Do not try to reach a tenant by hostname.
- Organization is never taken from a URL, query string, or path — only the
  session. You cannot switch tenants by editing a URL.
- The member portal (`/member`) is **out of scope**: it hard-rejects apex hosts
  with no session-scoped escape hatch, so it genuinely requires a tenant
  hostname that does not exist in testing.

ActiveClinic is path-based on one hostname, so it has no equivalent constraint.

## Persona 1 — BlessBoard HQ admin

| Field | Value |
|---|---|
| Email | `qa.organisation_administrator@demo-church.example.test` |
| Organization / church | `demo-church` / `demo-church` ("Demo Church") |
| Scope | Church-wide (no branch binding) |
| Canonical RBAC role | `organisation_administrator` |
| Legacy sign-in role | `church_hq_admin` (required by `establishBlessBoardSession`) |
| Credential | Shared testing password via `blessboard:seed-qa-role-users` |

Effective website permissions: `website.view`, `website.edit`, `website.publish`,
`website.rollback`, `website.submit`, `website.media.upload`.

Verified surfaces (all HTTP 200):

| Surface | Path |
|---|---|
| Website admin / edit | `/hq/website` |
| Publish review | `/hq/website/publish/review` |
| Version history | `/hq/website/version-history` |
| Content admin | `/hq/content` |
| Media library | `/hq/content/media` |
| Public church page | `/c/demo-church` |

Inline editing is available church-wide (`data-bb-edit-scope="church"`) and on
every branch page (`scope="branch"`). **Use this persona for restore/rollback QA.**

## Persona 2 — BlessBoard branch admin (multi-branch church)

`demo-church` has **4 active branches** (`hq` is primary, plus
`demo-church-lusaka`, `demo-church-ndola`, `demo-mazabuka`), so it is the correct
tenant for multi-branch scoping QA.

| Field | Value |
|---|---|
| Email | `qa.branch_administrator@demo-church.example.test` |
| Organization / church | `demo-church` / `demo-church` |
| Assigned branch | `demo-church-lusaka` — deliberately **not** the primary branch |
| Canonical RBAC role | `branch_administrator` (scope `branch`) |
| Legacy sign-in role | `branch_admin` bound to `demo-church-lusaka` |
| Credential | Shared testing password via `blessboard:seed-qa-role-users` |

Effective website permissions: `website.view`, `website.edit`, `website.publish`
on the assigned branch only. **`website.rollback` is intentionally withheld** from
`branch_administrator` — restore is an HQ-level capability. A branch admin being
unable to restore is correct behaviour, not a defect; do not file it as a bug and
do not widen the grant.

Verified surfaces:

| Surface | Path | Result |
|---|---|---|
| Branch website **editor** | `/c/demo-church/branches/demo-church-lusaka?website_edit=1` | 200, edit toolbar present |
| Branch public page | `/c/demo-church/branches/demo-church-lusaka` | 200 |
| Branch content admin | `/branch-admin/content` | 200 |
| Branch service times | `/branch-admin/website/service-times` | 200 |
| Branch media library | `/branch-admin/content/media` | 200 |
| Branch website entry link | `/branch-admin/website` | 303 → church-wide page (**see known issues**) |

This persona is the regression guard for the assigned-branch authorization fix
(`src/blessboard/http/resolveAssignedBranchContext.js`, shipped in
`377f8c09024f`). Before that fix, a branch admin whose branch was not the church
primary was denied their own editor.

## Persona 3 — ActiveClinic clinic admin

| Field | Value |
|---|---|
| Email | `qa.fullproduct.260817235630@example.test` |
| Organization | `qa-full-product-clinic-260817235630-805675` |
| Facility | `hq` (primary), active facility assignment present |
| Role | `activeclinic_organization_admin`, scope `organisation` |
| Credential | Shared testing password, set via `setPlatformIdentityPassword` |

Effective website permissions: `website.view`, `website.edit`, `website.publish`,
`website.restore`, `website.rollback` — this persona **can** exercise restore.

Website state: instance `status=published`, `lifecycle=public`, not edit- or
publish-locked, `last_published_at` set, 2 version rows present, so version
history and restore both have data to act on.

Verified surfaces (all HTTP 200):

| Surface | Path |
|---|---|
| Website CMS / edit | `/app/settings/website` |
| Pages | `/app/settings/website/pages` |
| Media | `/app/settings/website/media` |
| Public site | `/clinics/qa-full-product-clinic-260817235630-805675` |
| Preview | `/clinics/:clinicKey/website/preview` |
| Publish (POST) | `/clinics/:clinicKey/website/publish` |
| Versions / restore | `/clinics/:clinicKey/website/versions`, `.../versions/:versionId/restore` |

This identity had a valid, enabled account but **no password known to QA**, which
made it unusable for browser testing. It was repaired in place rather than
replaced, because its published website and version history are exactly what
website QA needs. The organization is `data_environment=testing` with
`test_cleanup_eligible=true`, so it is disposable.

## Isolation — verified, not assumed

`/c/...` paths are the **public** website, so an HTTP 200 there proves nothing
about authorization. What matters is whether the page renders edit affordances
(`data-bb-edit-toolbar`, `data-bb-save-url`, `data-bb-publish-url`). Measured:

| Actor | Own branch (Lusaka) | Sibling branches (Ndola, Mazabuka) | Church-wide |
|---|---|---|---|
| Branch admin | editable, `scope=branch` | **not editable** | **not editable** |
| HQ admin | editable, `scope=branch` | editable, `scope=branch` | editable, `scope=church` |

Additional denials confirmed for the branch admin (HTTP 403): `/hq/website`,
`/hq/website/publish/review`, `/hq/website/version-history`.

Permission-layer isolation, evaluated through each product's real authorization
service:

- Branch admin: `website.edit` denied on a foreign church (`baptist-church`) and
  on the sibling `hq` branch — both `RBAC_SCOPE_MISMATCH`.
- HQ admin: `website.edit` denied on a foreign church — `RBAC_SCOPE_MISMATCH`.
- Clinic admin: `website.edit` denied on a foreign clinic — `access_denied`.

## Known issues

### `/branch-admin/website` is not branch-scoped

`resolveBranchWebsiteEditorPath` in
`src/blessboard/http/websiteChangeSubmissionBranchRoutes.js:39` builds its target
from the organization key alone and ignores the branch, so it always redirects to
`/c/:org?website_edit=1`. For a branch admin that page renders **without** edit
affordances, so the link is a dead end.

- **Not a security problem.** Edit affordances are correctly withheld; the branch
  admin cannot edit church-wide content. Only the navigation target is wrong.
- **Workaround for QA (verified):** go directly to
  `/c/demo-church/branches/demo-church-lusaka?website_edit=1`.
- **Suggested fix:** use `publicBranchHomePath(orgKey, branchKey)` from
  `src/blessboard/urls/churchUrlHelper.js:72` with the actor's **assigned** branch
  key. It must be the assigned branch, not `tenant.primaryBranch` — that is the
  same defect class fixed in `377f8c09024f`, and
  `resolveAssignedBranchContext` currently returns `branchId`/`branchDisplayName`
  but no `branchKey`, so it needs a small extension plus a test.

### `website.restore` is granted to no role

The permission catalogue defines both `website.restore` and `website.rollback`,
but only `website.rollback` is granted to any BlessBoard role. The restore routes
accept either key, so behaviour is correct; `website.restore` is simply dormant.
Harmless, worth tidying post-V1.

## Re-verification tooling

All scripts are read-only unless stated, refuse non-testing databases, and never
print secrets.

```bash
# 1. Environment + tenant survey
scripts/local/run-with-blessboard-env.sh testing \
  node scripts/local/qa-personas-survey.js

# 2. Full 45-check persona readiness (exit 0 == all ready)
scripts/local/run-with-blessboard-env.sh testing \
  node scripts/local/qa-personas-verify.js

# 3. Real hosted sign-in + surface reachability for all three personas
node scripts/local/qa-hosted-login-check.js

# 4. Inline-edit isolation across branches
node scripts/local/qa-inline-edit-isolation.js
```

`scripts/local/qa-personas-probe.js` is the minimal identity/reachability probe.
`scripts/local/qa-set-ac-admin-password.js` is the only writing script: dry-run by
default, requires `--confirm`, reads the password from stdin only, and refuses any
organization that is not testing + `test_cleanup_eligible`.

## Cleanup

Nothing needs to be torn down for these personas to remain valid — they are
long-lived testing fixtures, not per-run artifacts.

| Persona | Cleanup method |
|---|---|
| BlessBoard HQ + branch admin | None required. Re-seed/reset idempotently with `npm run blessboard:seed-qa-role-users -- --confirm` (see `docs/blessboard/BLESSBOARD_QA_ROLE_USERS.md` for the password flag). |
| ActiveClinic clinic admin | Organization is `test_cleanup_eligible`; purge with `purgeActiveClinicTestingOrganization` if it must be reclaimed. Reserved demo tenants are refused by that service. |
| Disposable AC tenants (alternative) | `npm run activeclinic:hosted-auth-qa:testing -- --confirm` provisions an `ac-hqa-*` clinic and purges it at the end of the run. |

Website content QA will create draft and publication rows in `demo-church`, which
already carries 44 publication versions (3 published, 19 branch-scoped). That
history is the fixture for version-history and restore testing — **do not purge
it**. If a QA run leaves the church website in a bad state, restore an earlier
version through `/hq/website/version-history` as the HQ persona rather than
deleting rows.

## Suggested QA order

1. Run the pre-QA `/healthz` gate on both hosts.
2. HQ admin: edit → preview → publish → version history → **restore**.
3. Branch admin: edit own branch → publish → confirm sibling branches and
   church-wide are not editable, and `/hq/*` returns 403.
4. Clinic admin: edit → preview → publish → version history → restore.
5. Confirm cross-tenant isolation by attempting a foreign organization's surface.
