# V211-QA173 Overnight Regression Checkpoint

## Checkpoint

- Branch: `qa-v211-overnight-20261017`
- Previous HEAD: `a55731044240d385236f0a6d0cd8d21fcffd5a0d`
- Product runtime changes: none in QA173.
- Database identity: `moovex-platform-v7/testing`; no reset, migration, CREATE DATABASE, or protected mutation.

## Corrected branding expectations

`tests/blessboard-website-management-hub-parity.test 2.js` was an intended tracked test file, not an accidental duplicate. The two QA172 failures were stale negative assertions. They now verify that authorized users receive `data-bb-website-action="branding"` and that its href is `/hq/website/branding`.

The corrected suite also verifies the branding route returns HTTP 200, renders branding controls, and denies wrong-tenant/unauthorized access with HTTP 403. No product runtime code was changed.

## Final focused execution

Command:

```text
node --test 'tests/blessboard-website-management-hub-parity.test 2.js' \
  'tests/blessboard-website-mode-admin-nav.test 2.js' \
  tests/activeclinic-mw-stitch-parity.test.js \
  tests/activeclinic-editor-client-contracts.test.js \
  tests/v2-shared-media-upload-parity.test.js \
  tests/v203-qa-automation-gaps.test.js
```

Result: 58 passed, 0 failed, 0 skipped. Syntax checks and `git diff --check` passed.

The final executable set covers Website Management, navigation, branding authorization, ActiveClinic editor contracts, shared media/CSRF/tenant contracts, and shared security contracts. Reset/provisioning-dependent patient, member, invitation, announcement, and full persistence suites were not rerun.

## Ten-bug matrix

| Bug | Result | Remaining limitation |
|---|---|---|
| AC-11 | Partial | Add Section HTTP evidence exists; broader fixture/browser persistence coverage remains blocked |
| AC-15 | Partial | Staff registration persistence/duplicate proof blocked by MF08 setup collision |
| AC-16 | Partial | Portal suite historical pass; full browser navigation/activation blocked |
| AC-17 | Partial | Phone matching historical evidence; full format/ambiguity matrix blocked |
| BB-06 | Partial | Sermon workflow historical local pass; hosted/browser acceptance blocked |
| BB-07 | Partial | Event workflow historical local pass; hosted/browser acceptance blocked |
| BB-08 | Partial | Text verified; authorized media fixture unavailable |
| BB-09 | Partial | Local audience/draft/branch evidence; hosted/browser matrix blocked |
| BB-10 | Partial | Registration/CSRF evidence exists; full authorized browser/persistence run blocked |
| BB staff invitation | Partial | Local HTTP lifecycle/security evidence; authenticated browser fixture blocked |

## Release gates

- Focused local regression: PASS.
- Source integrity: PASS; no product runtime files changed.
- Security: PARTIAL; executable contracts pass, broader authenticated second-tenant coverage blocked.
- Database compatibility/safety: PASS for this non-destructive run.
- Hosted QA: BLOCKED; hosted runtime remains on the prior V9 SHA.
- Browser acceptance: BLOCKED.
- Media acceptance: BLOCKED by unavailable authorized fixture.
- Release readiness: NOT_READY.

Files approved for this checkpoint are the corrected regression test and QA167–QA173 reports only. Screenshots, `.qa-runtime`, logs, traces, temporary fixtures, historical artifacts, and secrets remain excluded.
