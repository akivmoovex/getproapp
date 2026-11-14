# Operational safety

`src/platform/ops/restoreTenant.js` is still absent. No backup or restore was run. D21-10 is pending, so no recovery-point or recovery-time number was chosen.

`GET /app/offline` still returns 503 and does not insert or begin a transaction. Offline writes stay disabled.

The demo clinic spec still has no `signingEnabled`, `patientDisplay`, or `twoScreen`. Juflona signing stays off. Break-glass is still absent.

Monitoring still has no approved name or threshold. D29-18 is pending. No monitor was added.
