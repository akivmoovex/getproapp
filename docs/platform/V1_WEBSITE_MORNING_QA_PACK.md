# V1 website — morning QA pack

Single hand-off document for manual browser QA of the V1 website surface across
BlessBoard and ActiveClinic. Prepared overnight 2026-08-26 → 2026-08-27.

**Verdict: `V1_WEBSITE_READY_FOR_MANUAL_QA`**

Blockers 0 · High 0 · Medium 18 · Low 10. Every remaining failure is
pre-existing debt that also fails before the overnight work, and none of it sits
in the V1 website path.

No browser or mobile QA was performed overnight — no browser automation tool was
available in this session. Everything below marked "verified" was verified by
HTTP request or database query, and the mobile section is a checklist for a human,
not a result.

## Current SHA

| Item | Value |
|---|---|
| Branch | `V7` |
| Verification commit | `79a6c2d85f478feeed630b92ea480aeb61241f17` |
| `activeclinic.pronline.org` `gitSha` | `79a6c2d85f47` |
| `blessboard.pronline.org` `gitSha` | `79a6c2d85f47` |
| Hosted current | **YES** — both hosts match the verification commit exactly |
| Deployment code (both hosts) | `moovex-platform-testing` |
| Environment (both hosts) | `testing` |
| `schemaCompatible` (both hosts) | `true` |
| Database identity | `moovex-platform-v7` / `testing` |

Both hosts run one process and one deployment; product is selected by hostname.
Re-check before starting, because QA is only meaningful against the SHA you think
you are testing:

```bash
curl -s https://blessboard.pronline.org/healthz
curl -s https://activeclinic.pronline.org/healthz
```

Production was not touched at any point.

## Overnight changes

Seven commits, oldest first. Product-code footprint is counted in files.

| SHA | Change | Product | Tests | Docs |
|---|---|---|---|---|
| `f552040a` | Unify BlessBoard and ActiveClinic on the shared V7 website engine | yes | yes | — |
| `6d311bf9` | Make the shared website engine canonical for BlessBoard publication | yes | yes | — |
| `1f3bc40a` | Draft-route classic CMS media and ordering edits | yes | yes | — |
| `de7057e2` | Render authored media alt text on BlessBoard public pages | yes | yes | — |
| `d59b4bce` | Share one SEO layer across the website engine | yes | yes | — |
| `6bdcfd91` | Share one content/media library model across the website engine | yes | yes | — |
| `24ac20c4` | Add shared media folders to the website engine | 13 | 5 | — |
| `daab0b01` | Triage known test debt for V1 relevance | — | 1 | 2 |
| `377f8c09` | Authorize branch website admins on their assigned branch | 4 | 5 | 2 |
| `79a6c2d8` | Verify hosted website QA personas for V7 testing | — | — | 1 |

The two changes most likely to affect manual QA:

- **`377f8c09` — branch authorization.** Branch-scoped website surfaces resolved
  their authorization context from the church's *primary* branch instead of the
  branch the admin is assigned to. In a multi-branch church that denied branch
  admins their own editor, filtered their sidebar links, and mislabelled the shell.
  Four call sites now share one resolver,
  `src/blessboard/http/resolveAssignedBranchContext.js`. Confirmed live on hosted:
  a Campus/Lusaka admin gets their own branch editor and cannot edit siblings.
- **`24ac20c4` — media folders.** Additive migrations only
  (`033_media_folders.sql`, `101_media_assets_folder.sql`), `ON DELETE SET NULL`,
  with database triggers enforcing tenant isolation. **Deleting a folder must
  never delete assets** — covered by tests and worth confirming by hand.

This pass additionally corrected one stale assertion in
`tests/church-platform-public-seo.test.js`: it pinned `church.css?v=75` while the
shell serves `v=76`. The suite guards SEO metadata, so it now asserts the
stylesheet is cache-busted rather than pinning a number that changes whenever
marketing CSS is edited. No product code changed for it.

## Tests

Run with a clean environment (`DATABASE_URL` and `PLATFORM_DEPLOYMENT_CODE`
unset) so nothing can reach the hosted database, since suites reset databases:

```bash
env -u DATABASE_URL -u GETPRO_DATABASE_URL -u PLATFORM_DEPLOYMENT_CODE \
    -u DEPLOYMENT_ENV -u DATABASE_IDENTITY_EXPECTED -u DATABASE_IDENTITY_ENV \
  node --test --test-concurrency=4 --test-reporter=tap <suite list>
```

### V1 website core — the set QA depends on

72 suites, selected by name across every requested area.

| | Tests | Pass | Fail | Skipped |
|---|---|---|---|---|
| **V1 website core** | **726** | **726** | **0** | **0** |

Zero failures and, importantly, **zero skips** — every assertion in this set
actually executed.

Category coverage of that set:

| Area | Suites | Area | Suites |
|---|---|---|---|
| Shared engine | 5 | Publish | 4 |
| ActiveClinic | 6 | Draft/live | 2 |
| BlessBoard | 16 | Preview | 1 |
| SEO | 2 | Version history | 2 |
| Content/media | 5 | Restore | 1 |
| Media folders | 1 | Tenant isolation | 2 |
| CMS | 2 | Branch/HQ | 6 |
| Auth/RBAC/CSRF | 2 | Mobile (390) | 2 |

The seven suites added overnight are all green on their own: **138 tests, 138
pass, 0 fail, 0 skipped** (`v7-website-engine-contract`,
`v7-blessboard-shared-website-engine`, `v7-shared-seo-expansion`,
`v7-shared-content-media-library`, `v7-shared-media-folders`,
`v7-classic-cms-media-order-drafts`, `v7-public-media-alt-text-rendering`).

Accessibility is covered by `blessboard-v5-a11y-structure`, which is in the wider
set below rather than the core set; its remaining failures are platform-admin
deployment page literals, not accessibility assertions.

### Wider relevant set, with a pre-overnight baseline

230 suites at HEAD, compared against the same suite list at `dea5e0f2` — the last
commit before the overnight website work — in a separate worktree. 223 suites
exist in both; the 7 that do not are the new suites listed above.

| Run | Suites | Tests | Pass | Fail | Skipped |
|---|---|---|---|---|---|
| Baseline `dea5e0f2` | 223 | 1791 | 1639 | 71 | 81 |
| HEAD `79a6c2d8` | 230 | 1931 | **1822** | **28** | 81 |

- **Regressions: 0.** Every assertion failing at HEAD also fails at the baseline.
- **Newly passing: 43**, including both "Branch Admin edits only the assigned
  branch" assertions — the branch-authorization fix.
- Failures fell from 71 to 28 while test count rose by 140.

The 81 skips and most of the 28 failures come from this machine not having a
fully provisioned local database with an active deployment row. They are
identical on both sides of the comparison, so they do not affect the regression
result, but the absolute count is inflated by environment rather than product.

Reproduce the comparison:

```bash
node scripts/local/qa-tap-summary.js <file.tap>            # totals + failures
node scripts/local/qa-tap-summary.js <file.tap> --names    # comparable names
node scripts/local/qa-classify-failures.js <file.tap>      # grouped by cause
```

## Remaining known debt

All 28 are pre-existing and outside the V1 website path.

| Severity | Count | Group | Why it is not V1 website risk |
|---|---|---|---|
| Medium | 12 | Stale CSS cache-buster pins and marketing copy literals (`church-stitch-*`, `blessboard-apex-auth-gui`, `blessboard-v5-mobile-drawer-menu`, `church-tenant-homepage`) | Tests pin exact `?v=` numbers or copy strings that legitimately change. Same class already corrected twice; no product defect behind them. |
| Medium | 5 | Platform-admin Stitch/deployment literals (`blessboard-v5-a11y-structure`, `blessboard-platform-admin-mobile-nav`) | Documented POST_V1 in `V1_TEST_DEBT_TRIAGE.md`. Platform-admin deployment pages, not tenant website. |
| Medium | 1 | Legacy V4 CSRF coverage (`views/church/branch-admin/attendance_tracker.ejs`) | Legacy V4 church shell, superseded by the V7 surfaces under QA. |
| Low | 7 | Suites needing a provisioned local database / active deployment row (`blessboard-rbac-e2e`, `blessboard-registration-public-miniwebsite`, `blessboard-tenant-auth`, `blessboard-public-content-schema`, `blessboard-branch-display-name`, `blessboard-platform-admin-login-diagnosis`, `church-hq-reports`) | Local environment provisioning, not product. Error is `inactive_deployment` or HTTP 503 from the unavailable-DB guard. |
| Low | 3 | Require a real browser / screenshot baselines (`blessboard-phase7-visual-stitch`, `blessboard-v5-mobile-burger-browser`) | Playwright suites; also blocked by an external Google Fonts fetch. Cannot pass headlessly here. |

Two further items carried forward from earlier passes, both non-blocking:

- **`/branch-admin/website` is not branch-scoped.** It redirects to
  `/c/:org?website_edit=1` because the URL builder ignores the branch, so a branch
  admin lands on a page with no edit affordances. **Not a security problem** —
  edit controls are correctly withheld. Use the direct branch editor URL in the
  checklist below. Fix needs the *assigned* branch key via
  `publicBranchHomePath`, not `tenant.primaryBranch`.
- **`website.restore` is granted to no role.** Both `website.restore` and
  `website.rollback` exist; only `website.rollback` is granted. Restore routes
  accept either, so behaviour is correct. Cosmetic, post-V1.
- **Per-suite database isolation** remains the prerequisite for making combined
  runs a hard gate (tracked in `V1_TEST_DEBT_TRIAGE.md`).

## Exact hosted QA credentials/personas by NAME ONLY

**No passwords in this document.** BlessBoard personas use the shared testing
password set by `npm run blessboard:seed-qa-role-users`; the ActiveClinic admin
password was set through `setPlatformIdentityPassword`. Full contract:
`docs/platform/HOSTED_WEBSITE_QA_PERSONAS.md`.

| Persona | Sign-in URL | Login name | Lands on |
|---|---|---|---|
| BlessBoard HQ admin | `https://blessboard.pronline.org/login` | `qa.organisation_administrator@demo-church.example.test` | `/hq` |
| BlessBoard branch admin | `https://blessboard.pronline.org/login` | `qa.branch_administrator@demo-church.example.test` | `/branch-admin` |
| ActiveClinic clinic admin | `https://activeclinic.pronline.org/login` | `qa.fullproduct.260817235630@example.test` | `/app` |

| Persona | Tenant | Scope | Restore allowed |
|---|---|---|---|
| BB HQ admin | org/church `demo-church` | church-wide | **yes** (`website.rollback`) |
| BB branch admin | `demo-church`, branch `demo-church-lusaka` | that branch only | **no — by design** |
| AC clinic admin | `qa-full-product-clinic-260817235630-805675`, facility `hq` | organisation | **yes** |

`demo-church` has 4 active branches (`hq` primary, plus `demo-church-lusaka`,
`demo-church-ndola`, `demo-mazabuka`) and 44 publication versions, 3 published —
so version history and restore have real data. **Do not purge that history.**

Two things that will otherwise waste your morning:

1. **There are no per-tenant hostnames.** Sign in on the apex host and navigate;
   tenant context comes from the session. Do not try to reach a tenant by URL.
   The single `demo-church.blessboard.test` domain row is a dead, non-resolvable
   record — ignore it.
2. **A branch admin cannot restore.** That is the intended role boundary, not a
   bug. Do the restore steps as the HQ or clinic-admin persona.

Session cookie `moovex_platform_testing_sid`, CSRF cookie
`moovex_platform_testing_csrf`. The BlessBoard member portal (`/member`) is out of
scope: it rejects apex hosts and testing has no tenant hostname.

## Tomorrow manual QA checklist

Pre-flight: run both `/healthz` checks and confirm `gitSha` is the SHA you intend
to test.

### BlessBoard HQ

Sign in at `https://blessboard.pronline.org/login` as
`qa.organisation_administrator@demo-church.example.test`.

- [ ] **login** — lands on `/hq`
- [ ] **edit text** — `/hq/website`, change a heading or paragraph
- [ ] **save draft** — change persists on reload
- [ ] **public unchanged** — `/c/demo-church` still shows the old text
- [ ] **preview** — draft text visible in preview, still not public
- [ ] **publish** — `/hq/website/publish/review` then publish; `/c/demo-church` updates
- [ ] **media** — `/hq/content/media`, upload an image
- [ ] **alt text** — set alt text, confirm it renders in public page markup
- [ ] **reorder** — reorder media/sections, confirm order persists and publishes
- [ ] **history** — `/hq/website/version-history` lists the new version
- [ ] **restore** — restore an earlier version; public page reverts
- [ ] **unpublish** — public page shows the unpublished state
- [ ] **republish** — public page returns

Folder check while in media: create a folder, move an asset in, delete the
folder, and confirm **the asset still exists** (unfiled), not deleted.

### BlessBoard branch

Sign in as `qa.branch_administrator@demo-church.example.test`.

- [ ] **login** — lands on `/branch-admin`
- [ ] **edit → draft → preview → publish** on the branch site. Use
      `https://blessboard.pronline.org/c/demo-church/branches/demo-church-lusaka?website_edit=1`
      directly — the `/branch-admin/website` link is the known dead-end noted above
- [ ] **HQ unchanged** — `/c/demo-church` (church-wide) content not altered
- [ ] **sibling unchanged** — `/c/demo-church/branches/demo-church-ndola` not altered
- [ ] **isolation** — `/hq/website` returns 403; sibling branch pages show no edit toolbar
- [ ] **restore** — confirm restore is *not* offered (expected role boundary)

### ActiveClinic

Sign in at `https://activeclinic.pronline.org/login` as
`qa.fullproduct.260817235630@example.test`.

- [ ] **login** — lands on `/app`
- [ ] **website hub** — `/app/settings/website`
- [ ] **edit** — `/app/settings/website/pages`, change content
- [ ] **draft** — draft saved, public clinic page unchanged
- [ ] **preview** — `/clinics/qa-full-product-clinic-260817235630-805675/website/preview`
- [ ] **publish** — public clinic page updates
- [ ] **history** — version list shows the new version
- [ ] **restore** — restore an earlier version; public page reverts

### Mobile

Not performed overnight. Check layout, tap targets, no horizontal overflow, and
that the editor and media picker are usable at each width.

- [ ] **BlessBoard 390** — `/c/demo-church`, `/hq/website`, `/hq/content/media`
- [ ] **BlessBoard 360** — same three
- [ ] **ActiveClinic 390** — public clinic page, `/app/settings/website`, media
- [ ] **ActiveClinic 360** — same three

## Remaining severity summary

```
BLOCKERS = 0
HIGH     = 0
MEDIUM   = 18   (12 stale pins/copy literals, 5 platform-admin Stitch, 1 legacy V4 CSRF)
LOW      = 10   (7 local-DB provisioning, 3 browser/screenshot)
```

Medium and Low are all pre-existing, all outside the V1 website path, and all
fail identically before the overnight work.

## Verdict

**`V1_WEBSITE_READY_FOR_MANUAL_QA`**

V1 website core is 726/726 with no skips, there are no regressions against the
pre-overnight baseline, hosted matches the verification SHA on both hosts, and all
three QA personas were confirmed to sign in and reach their website surfaces.
