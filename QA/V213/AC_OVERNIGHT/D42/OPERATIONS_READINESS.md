# Operations readiness

`src/platform/ops/restoreTenant.js` does not exist. No backup was taken and no restore was run. D21-10 is pending, so no recovery-point or recovery-time number was chosen.

`GET /app/offline` still returns 503 and does not insert or begin a transaction. Offline writes stay disabled. A later reconciliation design needs an approved queue of offline actions and a rule for a conflict with a stored clinical row. That rule is not approved.

Monitoring and alerting have no approved names, thresholds, or routes. D29-18 is pending. No monitor was added.

Secure media for website administration stays behind the existing platform gate. That path was not turned into a clinical attachment store.

Later batches, each blocked until its approval:

| Batch | Needs |
|---|---|
| Consent representative | D29-16 |
| Retention and legal hold | D21-09 |
| Restore drill | D21-10 |
| Offline writer | A named conflict rule |
| Monitors | D29-18 |
| Juflona signing | D21-13 |
