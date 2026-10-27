# V211-QA168 ActiveClinic Regression Coverage

## Scope and safety

The QA worktree remained on `qa-v211-overnight-20261017`. No product files were modified. No database reset, `CREATE DATABASE`, migration, truncate, drop, credential change, or testing-data mutation was performed.

The existing MF08 and Patient Portal integration suites provision/reset PostgreSQL in their setup. They were not rerun because this task explicitly prohibits the known database-setup collision and destructive helpers. Existing QA159/QA160 evidence was reused as historical execution evidence, not recounted as a new run.

## Executed non-destructive tests

Command:

```text
node --test tests/activeclinic-editor-client-contracts.test.js tests/activeclinic-mw-stitch-parity.test.js
```

Result: 10 passed, 0 failed, 0 skipped.

These tests verify ActiveClinic editor CSRF-safe request contracts, save/publish failure handling, private editor caching, multiline text preservation, CMS chrome, public/editor destinations, and Stitch parity. They do not prove patient persistence or phone matching.

## Coverage assessment

### AC-15 staff patient registration

Existing executable suite: `tests/activeclinic-mf08-patient-registration.test.js`, especially `registration GET, valid phone-first register, login, profile, and isolation`.

QA159 recorded the Review/submit UI parity evidence, but the broader persistence execution was blocked by the MF08 duplicate `pg_database_datname_index` setup failure. The requested final POST, exactly-one persistence, duplicate prevention, wrong-clinic denial, and browser checks were not safely rerun here.

Classification: `BLOCKED`.

### AC-17 patient phone matching

Existing patient foundation and portal/registration tests cover canonical patient creation, clinic association, identity/session isolation, and phone-first registration contracts. The requested independent matrix—unique existing match, unknown phone, ambiguous match, international representation, leading-zero representation, malformed phone, and cross-clinic denial—does not have a single safely executable non-reset integration test in the current fixture.

Classification: `PARTIALLY_VERIFIED`; no product defect confirmed.

### AC-16 patient portal entry/navigation

Existing executable suite: `tests/activeclinic-patient-portal.test.js`, including `guest token registration links patient and lists only owned bookings`, patient login/session isolation, CSRF login protection, and portal page states. QA160 recorded the 9/9 Patient Portal suite result. Full anonymous Find Clinic → clinic website → Patient Portal → Register navigation and activation/login browser coverage remain unavailable.

Classification: `PARTIALLY_VERIFIED`.

## Browser coverage

Browser execution is `BLOCKED` for this run. HTTP/local test evidence and static contract tests are separate from browser acceptance. No hosted mutation or account creation was attempted.

## Results

- TESTS_PASS: 10 newly executed non-destructive contract/parity tests; prior QA evidence includes portal 9/9.
- TESTS_FAIL: 0
- TESTS_SKIP: 0 in the executed command
- TESTS_BLOCKED: MF08 persistence suite, full phone-format matrix, browser navigation/activation
- CONFIRMED_PRODUCT_DEFECTS: none

No focused test was created or modified: adding a real integration test would require the unavailable non-reset synthetic clinic/database fixture, and placeholders are prohibited.
