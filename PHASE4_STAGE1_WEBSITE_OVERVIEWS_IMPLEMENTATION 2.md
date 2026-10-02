# Phase 4 Stage 1 — Website Overviews

## Stitch screens implemented

| Stitch screen | Responsive view |
| --- | --- |
| Phase4 - Foundation Website Overview | `phase4-foundation-website-overview.ejs` |
| Phase4 - Foundation Website Overview - Mobile | same (responsive) |
| Phase4 - Growth Website Workflow Overview | `phase4-growth-website-workflow-overview.ejs` |
| Phase4 - Growth Website Workflow Overview - Mobile | same (responsive) |
| Phase4 - Branch Website Overview | `phase4-branch-website-overview.ejs` |
| Phase4 - Branch Website Overview - Mobile | same (responsive) |

Desktop/mobile pairs share one server-rendered EJS each (`data-bb-viewport="responsive"`).

## Routes

| Route | Behavior |
| --- | --- |
| `GET /hq/website` | Plan-resolved overview: Foundation or Growth Phase 4 screen; Network keeps legacy `hq/website.ejs` |
| `GET /branch-admin/website` | Branch Phase 4 overview (canonical Branch Admin prefix; no duplicate `/branch/website` family) |

Existing editor, preview, publish, submission, restore, and Phase 3 workflow routes unchanged.

## Plan resolution

`evaluatePublishReadiness` → `planKey` via existing entitlement/subscription helpers.

- `foundation` / unknown → Foundation overview
- `growth` → Growth workflow overview
- `network` → legacy website screen (Stage 1 does not implement Network Phase 4)

## Aggregation

`src/blessboard/services/websiteOverviewService.js`

- `loadFoundationWebsiteOverview`
- `loadGrowthWebsiteOverview`
- `loadBranchWebsiteOverview`
- `loadHqWebsiteOverview`

Reuses: publish readiness/validation, onboarding summary, change submissions, publication versions, public content, branch settings.

## Data shown

**Foundation:** status, URL, last published, theme, draft notice, setup checklist (onboarding), contextual Edit/Preview/Publish or Fix Details, Undo Last Publish when ≥2 publication versions exist (links to existing restore).

**Growth:** summary counts (draft / waiting / requested / ready), needs-attention items, draft panel, ≤5 recent submissions, ≤5 Recent Website Changes, workflow guide (explanatory only).

**Branch:** assigned branch page summary, draft/submission state, shared HQ feedback (`reviewerComment` only), ≤5 history rows, no approve/publish.

## Security

- HQ gate on `/hq/website`; Branch gate on `/branch-admin/website`
- Organization-scoped HQ queries; branch-scoped submission queries with DB ownership checks
- Cross-org/cross-branch blocked (403/404)
- User content escaped in EJS (`<%= %>`)
- Branch never sees HQ approve/publish controls or internal-only notes

## Schema

No new migration.

## Files changed (Stage 1)

- `src/blessboard/services/websiteOverviewService.js` (new)
- `src/blessboard/http/churchWebsiteAdminRoutes.js`
- `src/blessboard/http/websiteChangeSubmissionBranchRoutes.js`
- `src/blessboard/http/branchAdminNav.js`
- `src/blessboard/http/branchAdminShellLocals.js`
- `views/blessboard/v5/hq/phase4-foundation-website-overview.ejs`
- `views/blessboard/v5/hq/phase4-growth-website-workflow-overview.ejs`
- `views/blessboard/v5/branch-admin/phase4-branch-website-overview.ejs`
- `public/blessboard/v5/hq-admin.css` (`bb-phase4-*`; cache `?v=63` in HQ shell)
- `public/blessboard/v5/branch-admin.css` (`bb-phase4-*`; cache `?v=40` in Branch shell)
- `tests/phase4-website-overviews.test.js`
- `tests/blessboard-apex-hq-website-lifecycle.test.js` (publish redirect assertion aligned with Phase 3 result URL)
- `PHASE4_STAGE1_WEBSITE_OVERVIEWS_IMPLEMENTATION.md`

## Tests

Focused: `tests/phase4-website-overviews.test.js` — 16 pass / 0 fail.

Regression (Stage 1 run): Phase 3 workflow/publishing/confirmation/compare-restore, HQ shell, branch shell — pass after apex lifecycle assertion update.

## Deferred (Stage 2+)

Publish review / success / error Stage 4 screens, Undo Last Publish workflow UX, full Recent Website Changes page, Network Phase 4 overview, compare, audit UI, approval settings, analytics, notifications, payments, scheduling.

## Manual verification

1. Foundation org: open `/hq/website` → Church Website + checklist; no branch submission panels; no version jargon.
2. Growth org: open `/hq/website` → Website Overview + counts + Recent Website Changes (not Version History).
3. Branch admin: open `/branch-admin/website` → Branch Website; only own branch; HQ feedback when changes requested.
4. Mobile widths: stacked cards, sticky Edit, no horizontal scroll.
5. Confirm Edit / Preview / Publish / submission links reach existing workflows.
