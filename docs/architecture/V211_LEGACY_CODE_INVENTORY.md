# V2.11 Legacy Code Inventory

Audit branch: `V11` at `90eaa4d5e9ef6e62d45f058bb38b63d10dd144ff`
Audit mode: read-only static source analysis. No runtime, database, migration, production, or deployment mutation was performed.

## Method and confidence

The inventory excludes `.git`, `node_modules`, generated/build/test-output directories, and binary/media/font/map files. Lines are newline counts. Reachability was assessed from static imports, route registration, EJS includes, package scripts, configuration, textual references, and test references. Dynamic route/view names, database-configured consumers, and operational runbooks remain possible blind spots; those findings are marked `UNKNOWN` or `CONDITIONAL_CANDIDATE`.

## Repository inventory

| Scope | Files | Lines | Notes |
|---|---:|---:|---|
| All source/text | 7,659 | 2,118,239 | Excludes generated/binary inputs |
| BlessBoard-labelled/product scope | 1,344 | 487,046 | Overlaps shared/platform files |
| ActiveClinic-labelled/product scope | 1,114 | 388,743 | Overlaps shared/platform files |
| `src/platform` scope | 920 | 214,291 | Includes platform tests/support found by path |
| Legacy-indicator scope | 953 | 108,164 | Heuristic, not a deletion total |
| Shared UI scope | 183 | 49,949 | Shared UI/CSS/template/support paths |
| Tests | 1,776 | 689,782 | Includes unit, integration, QA and E2E tests |
| `src/` | 1,944 | 604,070 | Reference inventory |
| `views/` | 1,345 | 141,641 | Reference inventory |
| `public/` | 183 | 132,491 | Excludes binary assets |
| `scripts/` | 304 | 92,320 | Includes operational/QA scripts |
| `db/migrations/` | 221 | 24,128 | Historical migrations retained |
| `db/postgres/` | 155 | 8,814 | Historical/compatibility SQL surface |

Scopes overlap; they must not be summed.

## Top deletion candidates

No candidate is proven safe for immediate deletion. The following are the strongest candidates for a separately verified cleanup batch:

| Candidate | Purpose / evidence | Classification | Removable lines |
|---|---|---|---:|
| `index.js` | Five-line startup wrapper; `package.json` and Hostinger documentation consume it | `CONDITIONAL_CANDIDATE` | 5 |
| `server.legacy.js` | Unprofiled fallback mounts legacy routes and tables | `CONDITIONAL_CANDIDATE` | ~615 |
| `src/platform/website/presentation/legacyFieldMap.js` | Legacy website field compatibility | `UNKNOWN` | Not estimated |
| `src/platform/http/compareLegacyHostContext.js` | Legacy host-context comparison/diagnostics | `UNKNOWN` | Not estimated |
| `src/migration/v4ToV5/` | V4→V5 compatibility/migration tooling | `HISTORICAL_KEEP` | Not removable |
| `src/migration/v5ToV7/` | V5→V7 compatibility/migration tooling | `HISTORICAL_KEEP` | Not removable |
| `db/scripts/migrate-v4-to-v5*.js` | Exposed migration/rehearsal/verification commands | `HISTORICAL_KEEP` | Not removable |
| `db/scripts/migrate-v5-to-v7*.js` | Exposed migration/rehearsal/verification commands | `HISTORICAL_KEEP` | Not removable |
| `src/routes/public.js` | Legacy marketplace/public route aggregate | `CONDITIONAL_CANDIDATE` | Not isolated |
| `src/routes/api.js` | Legacy API route aggregate | `CONDITIONAL_CANDIDATE` | Not isolated |
| `src/routes/fieldAgent.js` | Legacy field-agent routes | `CONDITIONAL_CANDIDATE` | Not isolated |
| `src/routes/admin.js` | Legacy admin routes | `CONDITIONAL_CANDIDATE` | Not isolated |
| `src/routes/companyPortal.js` | Legacy company portal | `CONDITIONAL_CANDIDATE` | Not isolated |
| `src/routes/clientPortal.js` | Legacy client portal | `CONDITIONAL_CANDIDATE` | Not isolated |
| `src/routes/blessboardAdmin.js` | Legacy BlessBoard admin compatibility | `HISTORICAL_KEEP` | Not removable yet |
| `src/auth/` | Legacy authentication implementation | `CONDITIONAL_CANDIDATE` | Not isolated |
| `src/tenants/` | Legacy tenant resolution/data access | `CONDITIONAL_CANDIDATE` | Not isolated |
| `views/admin/` | Legacy admin UI | `CONDITIONAL_CANDIDATE` | Not isolated |
| `views/field_agent/` | Legacy field-agent UI | `CONDITIONAL_CANDIDATE` | Not isolated |
| `src/db/pg/` legacy adapters | Legacy `public.*` schema/session consumers | `CONDITIONAL_CANDIDATE` | Not isolated |

The list is intentionally shorter than a fabricated “top 20 safe deletions”: static evidence does not prove these files can be removed.

## Legacy runtime and startup

`npm start` → `index.js` → `server.js` → profile validation and runtime selection. Profiled hosts select `v5FoundationServer.js` or `moovexPlatformRuntimeServer.js`; an absent/unsupported deployment profile can still select `server.legacy.js`.

`server.legacy.js` mounts `src/routes/public.js`, `api.js`, `fieldAgent.js`, `admin.js`, `companyPortal.js`, `clientPortal.js`, church routes, and `blessboardAdmin.js`. It depends on legacy auth, tenants, `connect-pg-simple`, `public.*` tables, runtime schema ensure modules, legacy views, seeds, and session behavior.

Retirement prerequisites:

1. Make missing `PLATFORM_DEPLOYMENT_CODE` fail closed or select an explicit supported runtime.
2. Verify every panel/worker/domain has an authoritative deployment profile.
3. Update startup configuration, CI, Playwright, and operational runbooks.
4. Migrate or formally retire all legacy URL/API families.
5. Prove no process depends on `GETPRO_DATABASE_URL`, `public.tenants`, `public.session`, or legacy runtime DDL.
6. Establish session invalidation/cookie migration behavior.
7. Run full regression and deployed smoke tests with fallback disabled.
8. Remove legacy-only dependencies only after route consumers are gone.

## Database and migration safety

The codebase contains platform, BlessBoard, ActiveClinic, deployment-scoped session, and historical `public.*` surfaces. `db/migrations/` and `db/postgres/` contain substantial history. Migration scripts remain exposed through package commands and encode rollback/rehearsal knowledge. No historical migration is a deletion candidate solely because it is old.

## Files that must not be deleted

1. `server.js`
2. `src/platform/http/v5FoundationServer.js`
3. `src/platform/http/moovexPlatformRuntimeServer.js`
4. `src/platform/config/deploymentProfiles.js`
5. `src/platform/http/productBootstrap.js`
6. `src/platform/` dependency-direction guardrails
7. `src/blessboard/` church/branch/member policy modules
8. `src/activeclinic/` patient/clinical policy modules
9. `db/migrations/`
10. `db/postgres/`

These are active runtime, product-policy, architectural-boundary, or rollback surfaces.

## Explicit unknowns and blockers

- Dynamic `require`, generated route names, EJS view names, and browser asset loading were not fully executed.
- Database-configured routes, scheduled jobs, and deployment-panel settings were not inspected live.
- No route crawl, coverage run, schema inspection, or production log review was performed.
- “Unreferenced” suffixed files and duplicate fixtures require runtime/operational confirmation.
- `server.legacy.js` cannot be classified `SAFE_CANDIDATE` until the unprofiled fallback and all legacy consumers are retired.

## V211-ARCH-02 verification

The expected V11 commit was verified as `90eaa4d5e9ef6e62d45f058bb38b63d10dd144ff`; only the three V211 audit documents were present as uncommitted files. A fresh newline-count scan produced 7,673 files and 2,122,173 lines under the broad exclusion rules. This differs from the initial 7,659 / 2,118,239 count because the fresh scan includes the newly created reports and uses the repository's current file set. Excluding files whose stem contains the archival `" 2"` suffix produces 6,178 files and 1,634,326 lines; that stricter figure is not directly comparable to the original overlapping scope counts.

The 20 candidate rows above were rechecked against exact paths and static evidence. No candidate was promoted to `SAFE_CANDIDATE`: dynamic imports, deployment settings, generated route/view names, database consumers, or rollback obligations remain incomplete for every deletion proposal. Migration directories and historical SQL remain `HISTORICAL_KEEP`.
