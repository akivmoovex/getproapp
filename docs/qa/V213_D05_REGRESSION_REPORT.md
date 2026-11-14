# V2.13 D05 — CSRF Hardening and Bug Regression CI Report

Baseline: `b8f6b420d25e908de64ba292866c218c32edc30c`  
Inventory: `docs/qa/V213_D05_BUG_REGRESSION_INVENTORY.json`  
Matrix (D04 retained): `docs/qa/V213_BB_REGRESSION_MATRIX.md`

## CSRF shell hardening

| Item | Status |
|---|---|
| HQ shell (`hqAdminShellLocals.js`) | Hardened — extras cannot override `csrfToken`/`csrfField` |
| Branch shell (`branchAdminShellLocals.js`) | Hardened — same contract |
| Legitimate caller conflicts | NONE_FOUND |
| Website-editor `issueOrReuseCsrfToken` | Untouched |
| Standalone membership/public CSRF | Untouched |
| Override regression tests | `tests/v13/contract/csrf-shell-extra-override-hardening.test.js` |

## Per-bug status

| BUG_ID | FEATURE | TEST_FILE | TEST_LEVEL | TEST_STATUS | REQUIRED_FIX | CI_JOB | DATABASE_DEPENDENCY | EVIDENCE | RELEASE_BLOCKER |
|---|---|---|---|---|---|---|---|---|---|
| BB-01 | Homepage sections | `tests/v13/unit/bb01-*.test.js` + `bb01` contract + integration + browser | UNIT+INT+BROWSER | UNIT=PASS; CONTRACT=PASS; INT=NOT_RUN; BROWSER=NOT_RUN | CTA buttonText/buttonUrl rendered locally; script URLs rejected; DB persist/publish still required | v13-bb-bug-regressions | int/browser | text_/cta_/image_/story_ plus CTA button | YES |
| BB-02 | Announcement images | `bb02-*` | UNIT+INT+BROWSER | UNIT=PASS; CONTRACT=PASS; INT=NOT_RUN; BROWSER=NOT_RUN | Upload and public visibility repaired locally; DB persist still required | same | int/browser | media routes + /_bb/media DTO | YES |
| BB-03 | Events | `bb03-*` | UNIT+INT+BROWSER | UNIT=PASS; CONTRACT=PASS; INT=NOT_RUN; BROWSER=NOT_RUN | Create form and date validation repaired locally; DB persist still required | same | int/browser | open create form, datetime validation, CSRF, scope | YES |
| BB-04 | Sermons | `bb04-*` | UNIT+INT+BROWSER | UNIT=PASS; CONTRACT=PASS; INT=NOT_RUN; BROWSER=NOT_RUN | Add sermon control and thumbnail contract repaired locally; DB persist still required | same | int/browser | visible Add sermon, metadata, image, scope | YES |
| BB-05 | HQ member CSRF | `bb05-*` + shell hardening | UNIT+INT+BROWSER | UNIT=PASS; INT=NOT_RUN; BROWSER=NOT_RUN | Commit local fix + hosted retest | same | duplicates gated | single issuance + override guard | YES |
| BB-06 | Member activation | `bb06-*` | UNIT+INT+BROWSER | UNIT=PASS; CONTRACT=PASS; INT=NOT_RUN; BROWSER=NOT_RUN | Invitation wiring repaired locally; login persistence still required | same | int/browser | invitation form, password accept, identity ownership | YES |
| BB-24 | Directory contact/join | `bb24-*` | UNIT+INT+BROWSER | UNIT=PASS; CONTRACT=PASS; INT=NOT_RUN; BROWSER=NOT_RUN | Directory wiring repaired locally; two-church persistence still required | same | int/browser | visit/contact/join links, church enquiry binding | YES |
| INV-01 | Staff invitation | `inv01-*` | UNIT+INT+BROWSER | UNIT=PASS; CONTRACT=PASS; INT=NOT_RUN; BROWSER=NOT_RUN; LOGIN=NOT_EXECUTED | First authenticated login still required | same | int/browser | password, token, role, tenant, session-failure contracts | YES |

## Coverage summary

- **Established contracts proven (DB-independent):** CSRF shell hardening, BB-01..05/24/INV-01 unit contracts, sanity-01..06, CI isolation guards.
- **Defects still open (not marked fixed):** INV-01 first login not executed; BB-01 through BB-06 and BB-24 repaired locally uncommitted (integration/browser NOT_RUN); BB-05 CSRF fix remains uncommitted.
- **Blocked by holds:** integration + browser stages (`NOT_RUN`).
- **Not implemented:** none for the BB-06 invitation contract. Database acceptance and browser login remain NOT_RUN.

## Release conclusion

**RELEASE_BLOCKED** — required regressions remain unverified or open despite Stage A contract passes.

## CI

- Workflow: `.github/workflows/v13-bb-bug-regressions.yml` (`workflow_dispatch` only; DB stages `if: false`)
- Prior D04 workflow retained: `.github/workflows/v13-bb-qa-regression.yml`
- V12 workflows untouched
- Dispatch: NOT_PERFORMED in D05
