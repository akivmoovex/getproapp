# V211-QA227 Verified Test Promotion

Date: 2026-10-29  
Source: `qa/v211-qa226-security-baseline-repair` /
`bdaa74a4a4d1a6bd03eda9c377d3d5890689d89c`  
Target before promotion: `V11` /
`8833e51657a3d104cec0f6bb54234665a4afa656`

## Promoted correction

The QA226 security correction was reviewed and promoted:

- `db/scripts/lib/canonicalMigrationBaseline.js`
- `tests/v203-critical-platform-security.test.js`
- `docs/qa/V211_QA226_SECURITY_MIGRATION_BASELINE_REPAIR.md`

The baseline now recognizes the authoritative BlessBoard ceiling
`130_member_portal_invitations.sql`. Required migration markers remain strict,
including versions 129 and 130. Their identifiers are distinct and both are
present in ordered discovery. The similarly named files have different
contents/checksums; no migration was deleted, renamed, reordered, or executed
by this promotion.

## Behavioral-test review

The three QA224 proven mutations were reviewed:

1. M01/M02 Home CMS section iteration: baseline PASS, isolated mutation FAIL,
   restored PASS.
2. M03 Image + Text media rendering: baseline PASS, isolated mutation FAIL,
   restored PASS.
3. M05 native phone pattern: baseline PASS, isolated mutation FAIL, restored
   PASS.

The QA224 mutation harness was excluded as experimental. The QA223 mixed
closure file was excluded because several assertions are source-contract
checks rather than complete functional workflows. No unauthorized database,
hosted browser, credential, or product runtime changes were promoted.

## Verification

- Previously failing canonical migration/security test: PASS.
- Platform security and migration regression: 59 pass, 0 fail, 0 skip.
- ActiveClinic regression: 108 pass, 0 fail, 0 skip.
- BlessBoard relevant regression: 274 pass, 0 fail, 5 documented skips.
- Promoted baseline assertion: PASS.
- Build: PASS.
- `git diff --check`: PASS.

The five BlessBoard skips are existing documented suite skips. No assertion
was weakened and no failure was hidden.

## Result

The promotion was committed and pushed normally to `origin/V11`. Local and
remote V11 SHAs match. Main, databases, Hostinger, production, and deployment
were unchanged.

Hosted authenticated browser acceptance remains incomplete. The 39/20/8
coverage totals remain unchanged; browser/database fixture gaps are not
converted into automated passes by this promotion.
