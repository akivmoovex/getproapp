# V211-QA163 Navigation Regression and Push

## Workspace

- Branch: `qa-v211-overnight-20261017`
- Previous HEAD: `3728e577d173212b83c13ea9606f60a36343125a`
- Existing screenshots, `.qa-runtime/`, historical QA documents, and unrelated test changes were preserved and excluded.

## Failure classification

1. `tests/blessboard-website-mode-admin-nav.test 2.js`
   - Failure: the multi-site HQ navigation assertion found inactive `Old Campus` in the rendered navigation.
   - Classification: `REAL_PRODUCT_NAVIGATION_DEFECT`.
   - Root cause: `listActiveBranchesByChurchId` selected both active and inactive branches, despite its active-only contract. The smallest correction restricts the query to `status = 'active'`.

2. `tests/activeclinic-mw-stitch-parity.test.js`
   - Failure: the parity test searched the EJS source for literal Stitch labels that are supplied through the `websitePresentation` model.
   - Classification: `STALE_TEST_EXPECTATION`.
   - Root cause: the template correctly binds `html.servicesHeading`, `html.doctorsHeading`, `html.visitHeading`, `html.location`, and `html.conversion`; labels are not hardcoded in this view.

## Changes

- `src/blessboard/repositories/blessBoardBranchRepository.js`: filter the active-branch repository contract to active branches only.
- `tests/activeclinic-mw-stitch-parity.test.js`: assert the canonical dynamic presentation bindings rather than stale literal labels.

No other product files were changed. No database reset, migration, deployment, or protected-branch operation was performed.

## Regression

Command:

```text
node --test 'tests/blessboard-website-mode-admin-nav.test 2.js' tests/activeclinic-mw-stitch-parity.test.js
```

Result: 15 tests passed, 0 failed, 0 skipped.

The suite verified single-site and multi-site HQ navigation, active-branch filtering, branch-admin isolation, cross-branch denial, ActiveClinic CMS chrome, dynamic home bindings, and publication controls.

## Commit and push

Commit:

`V2.11 QA: align website navigation regression coverage`

The QA branch was pushed only after the focused suite and staged diff checks passed. Remote verification must match the new local HEAD.

## Remaining release blockers

Existing QA release limitations remain unchanged: hosted QA and browser acceptance gaps, excluded runtime artifacts, and any limitations recorded by QA161. This checkpoint does not constitute release approval.
