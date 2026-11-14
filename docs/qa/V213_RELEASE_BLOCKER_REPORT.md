# V2.13 Release Blocker Report — BlessBoard sanity regressions

Generated for D04 QA infrastructure; updated in D05 after CSRF shell hardening.
Product defect repairs (except authorized CSRF shell hardening) remain out of scope.
D05 inventory: `docs/qa/V213_D05_BUG_REGRESSION_INVENTORY.json`.

## Conclusion

**RELEASE_BLOCKED**

Stable Stage A contracts may pass while required V2.12 regressions remain open. Passing baseline tests do not imply release readiness.

## Required open regressions

| BUG_ID | Status | Why it blocks release |
|---|---|---|
| BB-01 | REPAIRED_DB_INDEPENDENT_UNCOMMITTED | CTA button label and URL rendered locally; unsafe script URLs rejected; integration and browser persistence not executed |
| BB-02 | REPAIRED_DB_INDEPENDENT_UNCOMMITTED | Upload picker and public visibility repaired locally; integration and browser not executed |
| BB-03 | REPAIRED_DB_INDEPENDENT_UNCOMMITTED | Create form and date validation repaired locally; integration and browser persistence not executed |
| BB-04 | REPAIRED_DB_INDEPENDENT_UNCOMMITTED | Add sermon control and thumbnail contract repaired locally; integration and browser persistence not executed |
| BB-05 | FIXED_LOCALLY_UNCOMMITTED | CSRF repair uncommitted; hosted retest outstanding |
| BB-06 | REPAIRED_DB_INDEPENDENT_UNCOMMITTED | Invitation wiring repaired locally; activation login persistence not executed |
| BB-24 | REPAIRED_DB_INDEPENDENT_UNCOMMITTED | Directory contact/join repaired locally; two-church persistence not executed |
| INV-01 | LOGIN_NOT_EXECUTED | Invitation and password setup verified in source; first authenticated login not executed |

## Distinctions

- **Established behavior that must pass:** DB-independent CSRF/section/media/route contracts, CI isolation guards, version 2.13 contracts.
- **Known V2.12 defects awaiting repair or authorized evidence:** INV-01 first login not executed; BB-01 through BB-06 and BB-24 repaired locally (DB/browser evidence outstanding); BB-05 until committed/hosted.
- **Missing/partial features:** none newly classified in D10. BB-06 invitation wiring is repaired locally; login persistence remains NOT_RUN.
- **Blocked by holds:** Integration + browser stages (`NOT_RUN`) until disposable DB stages are separately authorized.

## Evidence required to clear

See `docs/qa/V213_BB_REGRESSION_MATRIX.json` `evidenceToClose` per issue. Closing requires PASS evidence at the declared test levels — never skip-as-pass.
