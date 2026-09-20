# V8 Shared Validation & Error Handling

**Status:** Active  
**Branch:** `V8`  
**Modules:** `src/platform/validation/`, `src/platform/http/sharedApiError.js`

## Goals

1. One reusable validator set for identity, password, text, URL, media, and required fields.
2. Consistent field-level (`fieldErrors`) and form-level (`formError`) error payloads.
3. Safe API errors with correct HTTP status codes and correlation IDs.
4. Never expose database errors, stacks, credentials, or sensitive records to clients.
5. Preserve V7-compatible `ok` / `code` / `reason` / `requestId` contracts (additive only).
6. Keep product-specific business rules in BlessBoard / ActiveClinic services.

## Shared validators

`src/platform/validation/sharedFieldValidators.js`

| Helper | Use |
|--------|-----|
| `validateRequired` | Non-empty required fields |
| `validateEmail` / `validatePhone` | Identity / contact shape |
| `validateText` | Length + unsafe-content checks |
| `validateUrl` | Delegates to `safeExternalUrl` |
| `validateUuid` | Identifier fields |
| `validateImageUpload` | MIME + size (5 MB image set) |
| `validateFields` | Multi-field form → `fieldErrors` + `formError` |
| `validatePasswordPair` | Re-exports shared password policy |

Website `contentTypes` email/phone validation and Hostinger media limits reuse these helpers.

## Safe API errors

`src/platform/http/sharedApiError.js`

- `sendSafeApiError` / `sendValidationApiError` / `sendAuthorizationApiError` / `sendBackendFailureApiError`
- `wrapAsyncRoute` for async handler failures
- `ensureCorrelationId` → `X-Request-Id` + `X-Correlation-Id`
- `sanitizePublicErrorMessage` strips secrets / stacks / connection strings

JSON error body (additive):

```json
{
  "ok": false,
  "code": "validation_failed",
  "reason": "invalid_email",
  "requestId": "…",
  "correlationId": "…",
  "fieldErrors": { "email": "Enter a valid email address." },
  "formError": "Please correct the highlighted fields."
}
```

BB/AC website JSON helpers attach correlation IDs without changing existing success shapes.

## Tests

```bash
node --test --test-concurrency=1 tests/v8-shared-validation.test.js
npm run test:v8:regression
```
