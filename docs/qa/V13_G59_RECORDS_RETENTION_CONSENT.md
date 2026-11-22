# V13 G59 — records, retention, and consent

`recordRetentionRules.js` plans metadata only.

- Elapsed time never deletes.
- A legal hold requires a reason and `authorizationOk`. It sets `deleted: false`.
- Release requires `releaseAuthorized` as well. The record stays.
- Consent requires a caller-supplied scope, method, and timestamp. Withdrawal is recorded only when `withdrawn` is true.

No retention period was chosen. Paper disposal still returns `legal_approval_required`. Migration 043 was not executed, and these planners are not mounted on HTTP. Hold persistence remains `MIGRATION_PENDING`.

```
RECORD_RETENTION=PARTIAL
LEGAL_HOLDS=MIGRATION_PENDING
CONSENT_HISTORY=PARTIAL
AUTOMATIC_RECORD_DELETION=DISABLED
```
