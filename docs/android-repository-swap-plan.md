# Android repository swap plan (fake → real API)

Goal: **ViewModels and Compose screens stay stable**; only `data/` (repositories, mappers, network) changes when the backend is wired.

---

## Part 1 — Layering (strict dependency direction)

```
UI (Compose)  →  ViewModels  →  Repository interfaces  →  [Fake | Remote] implementation
                                      ↑
                               Domain / repo models (optional)
                                      ↑
                               DTOs + HTTP  ←  ApiService (Retrofit)
```

- **UI models** (`ui/model/*`, `ui/state/*`): presentation only; built from domain or mapped directly from domain in ViewModels (or in repository if you keep one mapping step).
- **Repository interfaces** (`data/repository/*`): suspend functions returning Kotlin `Result` or domain types — **no** Retrofit types here.
- **DTOs** (`data/api/dto/*`): JSON shapes; **never** imported from Composables.
- **Mappers** (`data/mapper/*`): DTO → `UiModel` or DTO → domain → `UiModel`.

Existing template already follows **ViewModel → interface → fake**. Replace **fake** with **remote** that calls `ApiService`.

---

## Part 2 — Repository matrix

| Interface | Current fake | Future real | Methods (keep stable) |
|-----------|--------------|-------------|------------------------|
| `SearchRepository` | `FakeSearchRepository` | `RemoteSearchRepository` | `suspend fun search(params: SearchParams): List<ProfessionalUiModel>` — *or return `Result<>`; see error section* |
| `CategoryRepository` | `FakeCategoryRepository` | `RemoteCategoryRepository` | `suspend fun getCategories(): List<CategoryUiModel>` |
| `ProfessionalRepository` | `FakeProfessionalRepository` | `RemoteProfessionalRepository` | `getById`, `getByIdOrSlug` |
| `CallbackRepository` | `FakeCallbackRepository` | `RemoteCallbackRepository` | `submitCallback(CallbackSubmission): Result<Unit>` |
| `BusinessOnboardingRepository` | `FakeBusinessOnboardingRepository` | `RemoteBusinessOnboardingRepository` | `submitOnboarding(OnboardingSubmission): Result<Unit>` |

**Rule:** ViewModels depend only on these interfaces (constructor injection or a single factory). Swapping `AppDependencies` (or DI module) from fake to remote is a **one-line** change per app variant when ready.

---

## Part 3 — `AppDependencies` / provider

Current pattern (template):

```kotlin
object AppDependencies {
    val searchRepository: SearchRepository = FakeSearchRepository()
    // ...
}
```

**Evolution (still no heavy DI required):**

```kotlin
object AppDependencies {
    fun create(providers: RepositoryProviders = RepositoryProviders.default()): AppScope =
        AppScope(
            searchRepository = providers.search,
            // ...
        )
}

data class RepositoryProviders(
    val search: SearchRepository,
    // ...
) {
    companion object {
        fun fake() = RepositoryProviders(FakeSearchRepository(), /* ... */)
        fun remote(api: GetProApiService, mapper: GetProMappers) = RepositoryProviders(
            RemoteSearchRepository(api, mapper),
            /* ... */
        )
    }
}
```

**Build flavors:** `debug` → fakes for fast UI; `staging`/`release` → remote. Or: fakes only in `androidTest` / preview providers.

---

## Part 4 — Network layer (structure, not full prod)

Recommended packages under `data/api/`:

| Piece | Role |
|-------|------|
| `GetProApiService` | Retrofit interface: `GET /api/v1/...`, `POST /api/...` |
| `dto/*` | `@Serializable` data classes matching JSON |
| `ApiHttpClient` | OkHttp: timeouts (connect 15s, read 30s), optional logging interceptor in debug |
| `ApiException` / error parser | Map non-2xx + `{ error: string }` body to typed errors |

**Response strategy:**

- **Option A (simple):** Suspend functions return `Result<T>`; repository catches `HttpException`, parses JSON error.
- **Option B:** Wrap in `sealed class NetworkResult<out T>` with `Success`, `HttpError(val code, val message)`, `NetworkFailure(val throwable)`.

Keep **one** parsing path for `{ "error": "..." }` shared by all POST/GET error bodies.

**Serialization:** Kotlin Serialization or Moshi with Retrofit converter factory.

**Logging:** Debug-only OkHttp logging; never log PII in release.

**Retries:** Optional idempotent GET retry (1–2 times) with backoff; avoid auto-retry on POST without idempotency keys.

---

## Part 5 — Data models (three tiers)

### 5.1 API DTOs (network)

Examples (names illustrative):

- `CategoryDto`, `CategoriesResponseDto`
- `DirectoryItemDto`, `DirectoryResponseDto`
- `CompanyProfileDto`
- `CallbackRequestDto` / use inline `@Body` maps for small POSTs
- `ApiErrorDto` — `{ error: String }`

### 5.2 Domain / repository models (optional thin layer)

Use when UI models don’t match API (e.g. multiple endpoints combine into one screen). Otherwise **DTO → UiModel** is enough for MVP.

### 5.3 UI models (`ui/model`)

Already present: `ProfessionalUiModel`, `ProfileUiModel`, `CategoryUiModel`. **Do not** add JSON annotations here.

### 5.4 Mapping

| From | To | Where |
|------|-----|--------|
| `DirectoryItemDto` | `ProfessionalUiModel` | `DirectoryMapper` |
| `CompanyProfileDto` | `ProfileUiModel` | `ProfileMapper` |
| `CategoryDto` | `CategoryUiModel` | `CategoryMapper` |
| `CallbackSubmission` | JSON body for `POST /api/callback-interest` | `CallbackRepository` impl (add `tenantId` from config) |
| `OnboardingSubmission` | JSON body for `POST /api/professional-signups` | Map `businessName` → API field **`name`** |

---

## Part 6 — Error handling (ViewModels)

Repositories should surface outcomes so ViewModels can set `UiState` consistently.

**Suggested pattern:**

1. Repository returns `Result<List<ProfessionalUiModel>>` or throws **only** unexpected errors; prefer `Result` for predictability.
2. ViewModel:
   - `loading = true` at start of coroutine
   - `onSuccess` → update data, clear `error`
   - `onFailure` → set `error` string for banner/snackbar; optional `isRetryable`

**By flow:**

| Flow | Behavior |
|------|----------|
| Search | Show error row + allow retry; keep previous results empty on first failure |
| Categories | Same; empty list + error message |
| Profile | Full-screen error + Retry (already in profile screen template) |
| Callback submit | Field validation client-side; on server `400` show `error` from JSON in `submitError` |
| Onboarding | Same; map server message to `submitError` |

**Empty vs error:** Empty search results with `200` + `items: []` → **empty state UI**, not an error.

---

## Part 7 — Tenant fields for writes

When implementing **real** `CallbackRepository` / `BusinessOnboardingRepository`:

- Inject `TenantConfig` (`tenantId: Long`, `tenantSlug: String`) from `BuildConfig`.
- Add to outgoing JSON exactly as web: `tenantId`, `tenantSlug` on every POST that uses `resolveTenantIdStrict`.

Read APIs may use Host header; if backend expects explicit tenant on GET, add the same config as query or header per `android-api-contracts.md`.

---

## Part 8 — Migration phases

### Phase 1 — Lock interfaces

- Freeze method signatures on `SearchRepository`, `CategoryRepository`, `ProfessionalRepository`, `CallbackRepository`, `BusinessOnboardingRepository`.
- Move any “leaking” fake-only types out of interfaces.

### Phase 2 — DTOs + ApiService + mappers

- Add Retrofit `GetProApiService` + DTOs for **one** read path first (e.g. directory).
- Implement mappers to existing `UiModel`s.

### Phase 3 — First real repository

- Implement `RemoteSearchRepository` delegating to `GET /api/v1/directory` (when live).
- Point `AppDependencies` (staging flavor) to remote; run ViewModel tests / manual QA.

### Phase 4 — Remaining repositories

- Categories → profile → callback/onboarding POST (swap fakes; POST bodies already documented in `api.js`).

### Phase 5 — Cleanup

- Keep `Fake*` in `src/test` / `androidTest` / preview `PreviewParameterProvider`.
- Production code path uses only remote implementations.

---

## Part 9 — Lead / contact follow-up

`POST /api/leads` is not in the current fake layer; when adding **“request contact”** from profile:

1. Add `LeadRepository` **or** extend `CallbackRepository` only if product treats them the same (they are different server tables).
2. Prefer **`LeadRepository.submitLead(LeadSubmission)`** with `company_id` from profile state.

---

## Part 10 — Files in repo

| Artifact | Location |
|----------|----------|
| API contract reference | `docs/android-api-contracts.md` |
| This swap plan | `docs/android-repository-swap-plan.md` |
| Placeholder DTOs / Retrofit / mappers | `docs/android-ui-templates/kotlin/com/getpro/app/data/api/` (optional stubs) |

---

## Part 11 — Recommended next implementation step

1. Add **`GET /api/v1/directory`** and **`GET /api/v1/companies/:id`** on the Node backend (or BFF) matching `android-api-contracts.md`.
2. Implement **`RemoteSearchRepository`** + **`RemoteProfessionalRepository`** only.
3. Keep fakes for categories until `GET /api/v1/categories` exists, **or** ship categories read API in the same PR.

This minimizes UI churn and validates end-to-end with two screens (results + profile).
