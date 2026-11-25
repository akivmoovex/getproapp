# G205 unit and security results

`tests/v13/unit/g195-community-benefits.test.js` executed 6 tests and passed 6. The file covers attribution A–G, membership uniqueness, consent, QR issue/rotate/revoke/expiry, token absence from audits, linking, cross-clinic charts, the three money models, inactive preview text, ledger idempotency, refund negation, `posting_disabled`, the production flag, and navigation hidden by default.

`tests/v13/unit/g198-community-http.test.js` executed 1 test and passed 1. It uses the real router. Flag off is 404. Missing actor is 401. A bad code is 400. A valid code with no active agreement discloses no discount and leaves the ledger empty.

`tests/v13/contract/g194-community-benefits-contract.test.js` executed 1 test and passed 1. It locks the unapplied schema, the absent 048 and 049 migration paths, `allowTestActor: false`, and the frozen navigation list.

Security, CSRF, tenant, and facility denials are inside those tests and the browser spec. They are not a separate counted suite. The full safe-suite totals are in `G210_FINAL_HANDOFF.md` after that suite finishes.
