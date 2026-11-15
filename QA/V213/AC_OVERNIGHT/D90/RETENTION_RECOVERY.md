# Retention and recovery

No retention period, legal hold, or disposal approval is approved. None of those paths was added.

`src/platform/ops/restoreTenant.js` does not exist. No restore ran. The offline route still returns HTTP 503 and the handler does not contain `INSERT` or `BEGIN`. Offline writes stay off.
