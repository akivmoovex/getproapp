# Android / API — callback & request-a-call (`POST /api/callback-interest`)

Grounded in **`src/routes/api.js`** (`resolveTenantIdStrict`, Zambia phone checks, Israel gate).

## Request body (JSON)

| Field | Notes |
|-------|--------|
| `tenantId` | Required if slug not sent — must match a `tenants` row. |
| `tenantSlug` | Required if id not sent; if both sent, must match id. |
| `name` | Max ~120 |
| `phone` | Max 40; validated per region (e.g. `zm`) |
| `context` | Max ~120; optional; app uses `android_callback` + optional note snippet |
| `interest_label` / `label` | Max ~120 — Android builds from `CallbackSource` (`data/model/CallbackSource.kt`) |
| `cityName` | Optional; triggers waitlist-style label server-side |

**Success:** `{ "ok": true }`  
**Errors:** `{ "error": "..." }` with `400` / `403` as appropriate.

## Android vertical slice

1. **DTO:** `data/api/dto/CallbackRequestDto.kt`  
2. **Mapper:** `data/mapper/CallbackSubmissionMapper.kt` (`CallbackSubmission` → DTO)  
3. **API:** `data/api/CallbackApiService.kt` — stub: `data/fake/FakeCallbackApiService.kt`  
4. **Repository:** `data/remote/RemoteCallbackRepository.kt` + `TenantConfig.prototype`  
5. **ViewModel:** `ui/viewmodel/CallbackViewModel.kt` + `CallbackSession` from navigation (empty results vs profile).

## Sample JSON (success)

```json
{
  "tenantId": 1,
  "tenantSlug": "zm",
  "name": "Jane Banda",
  "phone": "+260971234567",
  "context": "android_callback · note: Evening call",
  "interest_label": "Android — no results · electrician · Lusaka"
}
```

## Debug / tests

`FakeCallbackApiService` supports `forceFailure` / `forceValidationError` constructor flags to exercise error UI.
