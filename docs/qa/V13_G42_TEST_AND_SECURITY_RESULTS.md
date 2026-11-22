# V13 G42 — tests and security

Added `tests/v13/contract/g39-g42-boundary-contracts.test.js`. It reads source and calls the pure paper-disposal and media-switch helpers. It does not open a database, start a server, or set an authorization flag.

The four cases lock:

- the existing patient, reception, clinical, laboratory, pharmacy, billing, and document routes
- manual prescription entry and the remaining-quantity dispense check
- paper retention, the media kill switch, and the offline 503
- migration 043 as additive SQL that no ActiveClinic HTTP file imports

`node --check` on that file passed. The isolated four-case run passed. The full database-free suite then passed 471 and failed 0, with 0 skipped. The historical baseline before this file was 467 passed and 0 failed.

No integration file and no Playwright spec was added, so the D19 counts stay 18 integration files, 18 ActiveClinic browser names, and 23 BlessBoard browser names. Gated HTTP and Playwright were not run. Those results are `NOT_RUN`, not pass.

CSRF, OTP, RBAC, tenant and facility predicates, signed-note protection, billing duplicate and reversal results, dispense permission, and appointment `STALE_VERSION` were not weakened.

```
NEW_CONTRACT_TESTS=4
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
SECURITY_CONTROLS_WEAKENED=NO
```
