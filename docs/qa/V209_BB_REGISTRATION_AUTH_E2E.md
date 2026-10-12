# V2.09 BlessBoard Registration Authentication E2E

The focused test is `tests/bb-registration-lifecycle.spec.cjs`.

Initial browser navigation and the first church-registration step passed using
the canonical local launcher and Chromium hostname mapping. The test currently
blocks at the Step 2 administrator-to-review transition: the page remains on
`Step 2 of 3: Administrator`, with the password fields empty after the
browser interaction, so no final POST was observed.

Classification: TEST_HARNESS / unresolved form-state interaction. No product
defect or database mutation was confirmed. No BB lifecycle PASS is claimed.

The Step 2 issue was a test interaction defect: the required role field was
not populated and the test used a broad password selector. The test now uses
the actual password IDs, fills the role, and follows the real three-step flow.

Two fresh Chromium runs passed registration, persistence, dashboard (`/hq`),
refresh, visible Account → Logout, relogin, and incorrect-password rejection.
Database persistence uses `blessboard.churches.display_name`/`legal_name`.
