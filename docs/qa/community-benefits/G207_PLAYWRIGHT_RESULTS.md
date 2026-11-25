# G207 Playwright results

Config `playwright.v13-ac-community.config.cjs` starts `tests/e2e/v13/communityBenefitsServer.cjs` on `127.0.0.1:4191`. The server injects the memory store and does not open PostgreSQL. This run is `BROWSER_MOCK_BACKED`. It is not `BROWSER_POSTGRES_E2E`.

The spec `tests/e2e/v13/v13-ac-community-benefits.spec.js` passed 7 tests:

1. Enrollment stays pending, then issue and rotate change the fallback code.
2. Clinic A fallback check-in links one confirmed local patient, stays ineligible, and hides the chart note.
3. Clinic B introduction previews the synthetic 10000 ngwee discount, a repeat stays eligible, and the return to clinic A stays ineligible.
4. Invalid, expired, revoked, suspended, member-only, inactive agreement, and wrong-clinic paths.
5. Ambiguous confirmation does not link, and a repeated check-in leaves the ledger at 0.
6. Widths 390, 768, and 1440, keyboard focus, cancel, and a reused CSRF token.
7. Missing actor and a billing role return 401.

Existing ActiveClinic and BlessBoard Playwright files were not edited. Their regression counts are in the final handoff.
