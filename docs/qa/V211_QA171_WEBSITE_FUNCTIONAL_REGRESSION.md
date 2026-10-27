# V211-QA171 Website Functional Regression

## Executed suites

The focused QA163 navigation/parity suite was rerun:

```text
node --test 'tests/blessboard-website-mode-admin-nav.test 2.js' tests/activeclinic-mw-stitch-parity.test.js
```

Result: 15 passed, 0 failed, 0 skipped.

The broader non-destructive contract command also ran:

```text
node --test 'tests/blessboard-website-mode-admin-nav.test 2.js' tests/activeclinic-mw-stitch-parity.test.js 'tests/blessboard-website-management-hub-parity.test 2.js' tests/v2-shared-media-upload-parity.test.js
```

Result: 26 passed, 2 failed, 0 skipped. Both failures are pre-existing Website Management hub parity assertions concerning branding action markup, not the QA163 navigation contract. No product code was changed and the focused 15-test suite remains green.

## BlessBoard

- Add Sermon visibility/navigation: `EXECUTED_PASS` in QA163/QA150 evidence; canonical `/c/:organizationKey/sermons?website_edit=1&website_mode=draft`.
- Sermon create/save/edit/publish/public visibility: `EXECUTED_PASS` in QA151/QA153 HTTP evidence.
- Add Event visibility/navigation: `EXECUTED_PASS` in QA163/QA150 evidence; canonical `/c/:organizationKey/events?website_edit=1&website_mode=draft`.
- Event create/save/edit/publish/public visibility: `EXECUTED_PASS` in QA151/QA153 HTTP evidence.
- Home text add/save/reopen: `EXECUTED_PASS` in QA155.
- Home media: `BLOCKED`; QA170 recorded no authorized asset and controlled `media_uploads_disabled`.
- Announcements: `EXECUTED_PASS` for published/public visibility and draft/future hiding in QA157; full hosted/browser verification remains unavailable.

## ActiveClinic

- Add Section visible and navigable: `EXECUTED_PASS` in QA158 HTTP evidence.
- Create/save/reopen/publish/public section: `EXECUTED_PASS` in QA158 HTTP evidence.
- CSRF and wrong-clinic protection: contract and prior authorization evidence exists; full new integration execution is `BLOCKED` by the prohibited MF08 database setup collision.

HTTP workflow and persistence/publication evidence are distinguished from browser acceptance. HTTP 200 alone was not treated as a functional pass.

## Results

- `BB_SERMON=EXECUTED_PASS`
- `BB_EVENT=EXECUTED_PASS`
- `BB_HOME=PARTIALLY_VERIFIED` (text pass; media blocked)
- `BB_ANNOUNCEMENTS=EXECUTED_PASS_LOCAL`
- `AC_WEBSITE=EXECUTED_PASS_LOCAL`
- `TESTS_PASS=15 focused; 26 in broader command`
- `TESTS_FAIL=0 focused; 2 broader pre-existing branding parity assertions`
- `TESTS_SKIP=0`
- `TESTS_BLOCKED=Home media fixture; ActiveClinic reset-based integration; hosted/browser acceptance`
- `CONFIRMED_PRODUCT_DEFECTS=NONE`

No stale assertion was changed because the two broader failures concern a separate existing branding contract and changing them was outside this regression's requested scope. No test files or product files were modified.
