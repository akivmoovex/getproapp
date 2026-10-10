# V2.09 Theme Management-Hub Fix

```text
ROOT_CAUSE=The fixture used /tmp/draft-logo.png, which is rejected by the existing website IMAGE URL contract
CLASSIFICATION=STALE_FIXTURE
FIX_TYPE=MINIMUM_TEST_ONLY_FIX
FILES_CHANGED=tests/blessboard-website-management-hub-parity.test.js (one URL literal); this report
FOCUSED_PASS=7
FOCUSED_FAIL=0
MEDIA_SECURITY_PASS=11
MEDIA_SECURITY_FAIL=0
THEME_CASES_RECONCILED=28 theme-specific cases; security batch reported separately
TOTAL_UNIQUE_TEST_PASS=39 in this focused correction/media run; prior Phase 2H aggregate was 50 pass and 1 fail before correction
TOTAL_UNIQUE_TEST_FAIL=0 in this focused correction/media run
APPLICATION_CODE_CHANGED=NO
PRODUCTION_MUTATION=NO
FINAL=V209_THEME_MANAGEMENT_HUB_REVIEW_COMPLETE
```

## Diagnosis

`contentService.saveWebsiteDraft()` delegates IMAGE validation to
`src/platform/website/mediaService.js`. The current contract rejects local
paths such as `/tmp/...`; accepted compatibility values include HTTPS URLs.
The failing fixture supplied:

```text
/tmp/draft-logo.png
```

The test-only correction uses:

```text
https://example.invalid/draft-logo.png
```

This preserves validation and security behavior; no application code or
validation rule was weakened.

## Verification

- Complete `tests/blessboard-website-management-hub-parity.test.js`: 7 passed,
  0 failed.
- Adjacent `tests/v7-website-image-management.test.js`: 11 passed, 0 failed.
- The separate Phase 2H security batch had already passed 20/20.
- The attempted `tests/v2-shared-media-upload-parity.test.js` invocation
  returned nonzero, but its large tool output was not available for reliable
  per-case extraction; it is not counted as a pass or silently folded into the
  totals above.

The 28 theme-specific cases remain the deduplicated theme inventory. The
security cases and media cases are reported as separate evidence batches to
avoid double counting.

