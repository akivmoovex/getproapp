# V211-QA172 Consolidated Regression with Branding Failure Triage

## Workspace

- Branch: `qa-v211-overnight-20261017`
- HEAD: `a55731044240d385236f0a6d0cd8d21fcffd5a0d`
- Database identity required: `moovex-platform-v7/testing`
- No product code was modified.

## Syntax and diff checks

`node --check` passed for the changed BlessBoard repository/navigation files and the focused ActiveClinic/media test files. `git diff --check` passed.

## Functional execution

Executed:

```text
node --test 'tests/blessboard-website-mode-admin-nav.test 2.js' \
  tests/activeclinic-mw-stitch-parity.test.js \
  tests/activeclinic-editor-client-contracts.test.js \
  tests/v2-shared-media-upload-parity.test.js \
  tests/v203-qa-automation-gaps.test.js
```

Result: 52 passed, 0 failed, 0 skipped.

Coverage included:

- BlessBoard website navigation, active-branch filtering, branch isolation, and cross-branch denial.
- ActiveClinic Website Management chrome, editor request/CSRF contracts, draft/publish failure handling, and public/editor parity.
- Shared media picker/upload contracts, entitlement policy, media ownership and cross-tenant denial.
- Shared authorization, host/product isolation, forged-tenant rejection, draft/public contracts, and invalid guest-token denial.

## Excluded suites and classification

The full ActiveClinic staff registration and patient portal suites, BlessBoard member registration, staff invitation, and announcement database suites were not rerun because their setup invokes `resetFoundationDatabase`, migrations, or database provisioning. Running them would violate the task's non-destructive constraint. Their prior QA results remain recorded separately and are not counted as this run's passes.

- Functional PASS: 52
- Functional FAIL: 0
- SKIP: 0
- BLOCKED: reset/provisioning-dependent AC-15, AC-16, AC-17, BB-06, BB-09, BB-10, and staff-invitation integration executions
- Environment failures: none in executed suites; unavailable authorized disposable integration harness for excluded suites
- Product failures: none

## Area results

- `AC_REGRESSION=PARTIAL`: Website contracts passed; patient registration, portal, and full phone matrix remain blocked by prohibited reset-based fixtures.
- `BB_REGRESSION=PARTIAL`: Website navigation/media/security contracts passed; full sermon/event/member/announcement persistence suites remain prior-evidence-only.
- `SECURITY_REGRESSION=PASS_FOR_EXECUTED_CONTRACTS`: host/product isolation, forged tenant, media ownership, CSRF-safe editor contracts, and cross-tenant denial contracts passed; broader authenticated V5 integration remains blocked.

Remaining blockers are the safe non-reset ActiveClinic/BlessBoard integration fixture, BB-08 authorized media asset, hosted deployment at the QA SHA, and authenticated browser acceptance.

## QA167–QA171 report inventory

- QA167: present — regression coverage matrix.
- QA168: present — ActiveClinic regression completion.
- QA169: present — BlessBoard security regression.
- QA170: present — Home media regression.
- QA171: present — website functional regression.

No referenced report was missing. Historical results above were not re-counted as current execution.

## Branding parity failure triage

The broader Website Management command previously produced two failures in `tests/blessboard-website-management-hub-parity.test 2.js`:

1. Test `HQ admin sees shared hub with church public URL, status, edit, preview, publish, history` at line 335 failed assertion `assert.doesNotMatch(page.text, /data-bb-website-action="branding"/)`. Expected: no branding action in the hub. Actual: the rendered hub contained `data-bb-website-action="branding"`.
2. Test `HQ branding settings page remains available for specialist branding work` at line 425 failed the same `assert.doesNotMatch(hub.text, /data-bb-website-action="branding"/)` assertion. Expected: no branding action in the hub while the separate branding route remained available. Actual: the hub contained the branding action.

Source evidence shows `views/blessboard/v5/hq/website-management.ejs` intentionally renders the branding tile when `actions.branding` is available (lines 330–331), and `src/blessboard/http/attachWebsiteAdminChrome.js` supplies the branding destination. The separate route `/hq/website/branding` is also implemented in `src/blessboard/http/churchWebsiteAdminRoutes.js`.

Both failures are `STALE_TEST_EXPECTATION`, not product regressions: the assertions contradict the current source/template contract. The behavior is user-visible as an additional valid Branding action, but it does not break navigation or remove the specialist branding page. No test expectation was changed because this task required triage and prohibited product runtime changes.

## Current versus historical totals

- Current safely executable command: 52 passed, 0 failed, 0 skipped.
- Current syntax checks: PASS.
- Current `git diff --check`: PASS.
- Current blocked suites: reset/provisioning-dependent ActiveClinic patient workflows and BlessBoard authenticated persistence/security workflows.
- Historical evidence is retained separately in QA168–QA171 and is not included in the current 52-test total.
- Branding product defects confirmed: none.
