# Shared website engine — final V1 consistency audit

Branch `V7`. Read-and-test-first audit comparing the ActiveClinic and BlessBoard
website implementations against the shared engine in `src/platform/website/`.
Production was not touched.

## Verdict

| Metric | Result |
|---|---|
| LIFECYCLE_DIVERGENCES | 5 (structural, documented; 0 fixed by design) |
| SECURITY_GAPS | 6 found, **6 fixed** |
| DIRECT_PUBLIC_WRITES | 4 (all BlessBoard-owned or legacy tables; 0 to shared live tables) |
| ACTIVECLINIC_REGRESSIONS | 0 |
| BLESSBOARD_REGRESSIONS | 0 |
| V1_BLOCKERS | 0 |
| PRODUCTION_TOUCHED | NO |

The two products share the engine's *stateless* layers cleanly — SEO, the
content/media library view model, media folders, the editable-field allowlist,
and public URL construction. They diverge almost completely in the *stateful*
lifecycle layer, and that divergence is architectural rather than accidental.
It is stable and covered by tests, so per the audit brief it was documented and
not refactored. What was fixed is a cluster of authorization gaps around
BlessBoard's publish surfaces, where routes that publish live content were gated
only on `website.view`.

## The central finding: two different sources of truth

This is the fact that explains most of the rest of the audit.

**ActiveClinic** is a true shared-engine tenant. Draft and live content are the
`draft_value` / `published_value` columns of `platform.website_content`,
versions are `platform.website_versions`, and lifecycle is
`platform.website_instances.lifecycle_status`. Every mutation goes through
`contentService`, `publicationService`, `versionService`, or `lifecycleService`.
I found no ActiveClinic write to any shared live-content table.

**BlessBoard** keeps its own CMS (`blessboard.public_pages` / `page_sections`),
its own draft overlays, its own version store
(`blessboard.website_publication_versions`), its own audit log, and its own
media store. Its publish path flips those rows live and *then* mirrors a single
JSON snapshot into the shared engine through
`src/platform/website-engine/blessboardBridge.js`:

```118:141:src/platform/website-engine/blessboardBridge.js
async function publishFromLegacy(db, input) {
  const resolved = await resolveInstance(db, input);
  ...
  const saved = await saveEngineDraft(db, resolved.instance, snapshot, input.actorIdentityId);
  if (!saved.ok) return { ok: false, code: saved.code, version: null };
  const published = await publicationService.publishWebsiteDraft(db, {
    organizationId: resolved.instance.organizationId,
    instanceId: resolved.instance.id,
    expectedProductCode: "blessboard",
    actorIdentityId: input.actorIdentityId || null,
    forceTenantPublish: true,
    allowEmpty: true,
  });
```

Nothing in BlessBoard's public read path consults `platform.website_content` or
`platform.website_versions`. The public page renders from
`website_publication_versions.snapshot_json` overlaid on the live CMS rows, gated
by `blessboard.church_settings.website_status`. So for BlessBoard the shared
tables are a write-only mirror, and because the mirror carries the whole site as
one content key, the shared engine's per-key diffing is degenerate.

Call direction is also inverted between the products. For ActiveClinic the
orchestrator calls the shared `publicationService`; for BlessBoard it calls into
BlessBoard, which calls back out to the engine:

```30:54:src/platform/website-engine/lifecycleOrchestrator.js
const BUILTIN = Object.freeze({
  [PRODUCT_CODE.BLESSBOARD]: Object.freeze({
    publish: (db, request) =>
      require("../../blessboard/services/churchWebsitePublishService").publishChurchWebsite(
        db,
        request
      ),
```

## Behavior-by-behavior comparison

`Shared` = the shared engine owns the behavior. `Adapter` = product supplies
inputs, shared code decides. `Local` = product-owned implementation.

| Behavior | ActiveClinic | BlessBoard | Common? |
|---|---|---|---|
| Website hub | Adapter — `loadWebsiteManagementSummary` | Local `loadHqWebsiteOverview`; only the presentation model shared | Partial |
| Editor shell / inline editor | Local EJS chrome; field allowlist shared | Local chrome + draft services; field allowlist shared | Allowlist only |
| Draft | Shared `contentService.saveWebsiteDraft` | Local `website_inline_field_drafts` / `website_structured_drafts` | No |
| Preview | Shared `resolver` in DRAFT mode | Local `loadTenantPublicPageModel` | No |
| Publish | Shared `publicationService.publishWebsiteDraft` | Local `publishChurchWebsite`, mirrors to shared | No |
| Unpublish | Shared `unpublishWebsite` → `applyLifecycle` | Local, then mirrors via `unpublishFromLegacy` | Partial |
| History | Shared `versionService.listWebsiteVersions` | Local `websitePublicationVersionService` | No |
| Restore | Shared restore-to-draft | Local restored-draft version row | No |
| SEO | Adapter over `seoModel` / `seoDiscovery` | Adapter over `seoModel` / `seoDiscovery` | **Yes** |
| Content/media library | Shared `libraryModel` + `renderWebsiteLibrary` | Shared `libraryModel` + `renderWebsiteLibrary` | **Yes** |
| Media folders | Shared `mediaFoldersService` | Shared `mediaFoldersService` | **Yes** |
| Permissions | Shared keys, shared `assertWebsiteAction` hook | Shared keys, local RBAC middleware | Keys only |
| Mobile contracts | 390/360 CSS + Chromium tests at 390×844 | Responsive CSS + `mobile_preview_confirmed` publish flag | No |

Media storage stays deliberately product-owned (`platform.website_media` vs
`blessboard.media_assets`) and the shared layer normalizes both into one card
shape. That is the engine working as designed, not a divergence.

## LIFECYCLE_DIVERGENCES (5) — documented, not refactored

1. **Source of truth for live content.** As above. Refactoring BlessBoard onto
   `platform.website_content` would rewrite its entire CMS, versioning, and
   public read path. Out of scope for V1 and not a defect.
2. **Lifecycle status column.** ActiveClinic uses
   `platform.website_instances.lifecycle_status`, whose only writer is
   `lifecycleService.applyLifecycle` — the one genuinely enforced single-writer
   invariant in the engine. BlessBoard uses
   `blessboard.church_settings.website_status` (`draft` / `published` /
   `suspended`) and never imports `lifecycleService` except through the bridge's
   unpublish path. The two products therefore answer "is this site live?" from
   different columns.
3. **Publish policy never evaluates for BlessBoard.** The instance is pinned to
   `REVIEW_BEFORE_PUBLISH` at provision time
   (`blessboardWebsiteAdapter.js:27`) and every bridge call then passes
   `forceTenantPublish: true`, so the shared `publishPolicy` gate is
   structurally bypassed. BlessBoard's real gate is its own approval settings.
4. **Restore semantics differ.** Shared restore copies a version into
   `draft_value` and creates no new version. BlessBoard's `createRestoredDraft`
   writes snapshot pages into draft CMS rows *and* inserts a new
   `status='draft'` version row, then self-checks historical immutability and
   throws `HISTORICAL_MUTATION` on drift — a guard the shared engine lacks.
   Both are non-destructive to live content and to history, so the outcome is
   equivalent even though the mechanism is not.
5. **Edit sessions exist only for ActiveClinic.** The shared
   `editSessionService` batches an editor's saves into one version. BlessBoard
   has no equivalent, so its version stream has different granularity.

Two smaller items in the same family, recorded but not counted as divergences
because neither writes state: ActiveClinic derives website status in two
independent places (`websiteCurrentState` and `websiteWorkflowStatus`) in
addition to the shared `lifecycleStatus`, which risks inconsistent UI copy; and
`activeclinic.healthcare_organizations.website_published` has two writers,
reconciled only by callers remembering to pass `syncProductAvailability: false`.

## SECURITY_GAPS (6) — all fixed

Every gap was a mutating website route reachable with less authority than the
action required. All were verified by reading the route table and the gate
factories, not inferred.

### 1. Branch publish had no publish gate (highest severity)

`POST /hq/website/branches/:branchKey/publish` ran the same handler as the
church-wide publish route but omitted `requireWebsitePublish`, so `website.view`
was sufficient to publish a branch mini-site live. `resolveBranchPublishScope`
resolves scope but performs no permission check, and the handler passes a
hardcoded `grantedPermissions: [PUBLISH]` to the orchestrator, so the engine's
own hook could not catch it either. Fixed by adding the gate its sibling
already had.

### 2. Submission decisions published live content behind `website.view`

The six `change-submissions` / `change-requests` decision routes were gated only
by `gateHq` (`website.view`). Approval calls `publishChurchWebsite`, so a
view-only member could publish the live site. Fixed with a new
`requireWebsiteDecision` gate requiring `website.review` **or**
`website.publish`. Per migration `093`, that admits `website_publisher`,
`website_reviewer`, `organisation_administrator`,
`church_system_administrator`, and `platform_administrator`, while correctly
excluding `website_editor`.

### 3. Restored-draft discard lacked the restore gate

`POST /hq/website/restored-draft/discard` carried no `requireWebsiteRestore`,
unlike every sibling restore route, even though its handler re-publishes live
CMS pages and sections from the current version snapshot with no version record.
Fixed.

### 4. Preview acknowledgement was view-only

`POST /hq/website/preview-ack` satisfies a publish precondition, so a view-only
member could clear a gate that the publish flow depends on. Now requires
`website.publish`.

### 5. Foundation repair was view-only

`POST /hq/website/repair-foundation` writes draft settings and draft pages.
Now requires `website.edit`.

### 6. ActiveClinic media upload accepted the CSRF token from the query string

```693:693:src/activeclinic/http/activeClinicWebsiteRoutes.js
      const csrfValue = (req.body && req.body[CSRF_FIELD]) || req.query[CSRF_FIELD];
```

Tokens in URLs leak through referrers and access logs. This was the only such
fallback in the repository and it had no consumer: the client posts
`new FormData(form)`, which includes the `_csrf` hidden input, and multer parses
multipart fields before the handler runs. Reduced to body-only.

## BUG fixed (1)

`POST /clinics/:clinicKey/website/unpublish` was registered twice in
`activeClinicWebsiteRoutes.js` with byte-identical bodies. Express only ever
reached the first, so the second was dead code and a live maintenance hazard —
a future fix applied to the wrong copy would read as correct and never execute.
The duplicate was removed.

## DIRECT_PUBLIC_WRITES (4)

No product writes `platform.website_content`, `platform.website_versions`, or
the lifecycle columns of `platform.website_instances` outside the shared
services. The only raw BlessBoard write to a shared table is metadata:

```35:41:src/blessboard/website/blessboardWebsiteAdapter.js
    const rows = await db.query(
      `UPDATE platform.website_instances
          SET adapter_mode = 'shared_engine', updated_at = now()
        WHERE id = $1 AND organization_id = $2
        RETURNING *`,
      [provisioned.instance.id, organizationId]
    );
```

The four writes that do set public content live outside a publish call all touch
product-owned or legacy tables:

1. **`discardGrowthRestoredWebsiteDraft`** re-publishes pages and sections from
   the current snapshot with no publish call, no version row, and no readiness
   validation (`websitePublicationVersionService.js:1934-1944`). Now at least
   gated on restore authority (gap 3 above).
2. **`publishInitialFoundationWebsite`** publishes pages and sections during
   registration provisioning, skipping HQ readiness gates
   (`churchWebsitePublishService.js:1084-1115`). Intentional for provisioning.
3. **Legacy branch editor** `src/routes/church/branchAdminWebsiteEditor.js`
   writes `public.church_branch_website_content` — a third publish surface on a
   third table, sharing nothing with either stack. Pre-existing; out of V1
   website scope.
4. **ActiveClinic demo seeding** sets `website_published = true` by raw SQL with
   no lifecycle update and no audit event
   (`activeClinicDemoClinicSeedService.js`), so seeded clinics can read as
   public while `lifecycle_status` still says provisional. Demo data only.

## Latent issues recorded, not fixed

None is reachable by a tenant actor at less than the required authority, so none
is a V1 blocker. Each is a drift risk worth tracking.

- `authorizeWebsite.authorizeWebsiteInstance` is the engine's only combined
  tenancy-plus-permission check and **no module calls it**. Every service uses
  the weaker `assertWebsiteInstanceScope`, which checks tenancy only, leaving
  permission enforcement ad hoc at the route layer. That is precisely why gaps
  1–5 were invisible.
- `publicationService.restoreWebsiteVersionLive` replaces live content with no
  permission check and no `publish_locked` / policy check, bypassing the gates
  `publishWebsiteDraft` enforces. Only reachable through the platform-admin
  path, whose actor holds all website permissions.
- BlessBoard routes pass hardcoded `grantedPermissions` arrays into the
  orchestrator, so the engine's permission hook always passes and cannot serve
  as a backstop for a route that forgets its gate.
- ActiveClinic's tenant publish path hardcodes `overrideReadiness: true` when
  `makePublic=1`, skipping the readiness checklist that the platform-admin path
  enforces.
- Media capability keys are applied inconsistently: ActiveClinic folder routes
  require `website.edit` while uploads require `website.media.upload`;
  BlessBoard uploads require `website.edit` and never check
  `website.media.upload` at all. Several declared keys
  (`website.submit`, `website.review`, `website.moderate`, `website.take_offline`,
  `website.suspend`, `website.manage_template`, `website.manage_policy`) are
  granted by role but enforced by no BlessBoard route.
- The "shared" engine is itself forked internally. `platformAdminWebsitesService`
  imports from both products; `lifecycleService` requires a BlessBoard
  repository at module load; `mediaService` is ActiveClinic-only in practice;
  `checklistService` ships clinic vocabulary as its default checklist;
  `submissionService` queries `activeclinic.*` unconditionally. Stable and
  tested, so left alone.
- Six modules (`seoModel`, `seoDiscovery`, `libraryModel`,
  `renderWebsiteLibrary`, `mediaFoldersService`, `safeValues`) are not exported
  from `index.js` and are reachable only by deep require. `index.js` is a barrel,
  not an enforced entry point.

## Tests

Environment scrubbed of hosted database variables before every run; suites
self-provision local Postgres databases.

**Targeted gate suites** (the seven suites covering the routes changed):
83/83 pass before the change, 83/83 after.

**Relevant regression set**, 103 suite files / 126 suites:

| | Tests | Pass | Fail | Skip |
|---|---|---|---|---|
| Baseline (changes stashed) | 1056 | 1037 | 6 | 13 |
| With changes | 1057 | 1038 | 6 | 13 |

Identical failure sets, so **0 regressions**; the extra test is the new
authorization guard. The 6 failures are pre-existing and unrelated: 4 are the
documented POST_V1 platform-admin Stitch literals, 1 is the pre-existing
`creates approved public content tables only` schema assertion (fails
identically on a stashed baseline in isolation), and 1 is the known cross-suite
interference in `buildPublicWebsiteNavigation`, which passes when its suite runs
alone at HEAD.

The new test, in `tests/blessboard-authorization-shells.test.js`, asserts that a
`website_editor` (view/edit/media.upload/submit, no publish) receives 403 on all
four newly gated routes, and that the rejection comes from the permission gate
rather than the CSRF check inside the handler. It was verified to fail when a
single gate is reverted, so it genuinely guards the fix rather than passing
vacuously.

## Files changed

Product code:

- `src/blessboard/http/churchWebsiteAdminRoutes.js` — publish gate on branch
  publish; publish gate on preview-ack; new edit gate on repair-foundation.
- `src/blessboard/http/websiteChangeSubmissionAdminRoutes.js` — new
  `requireWebsiteDecision` gate on all six decision routes.
- `src/blessboard/http/websitePublicationVersionAdminRoutes.js` — restore gate on
  restored-draft discard.
- `src/activeclinic/http/activeClinicWebsiteRoutes.js` — removed duplicate
  unpublish registration; CSRF token no longer read from the query string.

Tests:

- `tests/blessboard-authorization-shells.test.js` — new publish/restore
  authorization guard.
