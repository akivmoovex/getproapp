# Android — business onboarding / join API

Grounded in **`POST /api/professional-signups`** (`src/routes/api.js`). Creates a `professional_signups` row and a CRM task (`sourceType: "join_signup"`).

## Contract

| | |
|--|--|
| **Path** | `/api/professional-signups` |
| **Method** | `POST` |
| **Content-Type** | `application/json` |
| **Auth** | Public; tenant from body (`resolveTenantIdStrict`) — same rules as callback. |

### Request body

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `tenantId` | number | One of `tenantId` or `tenantSlug` | Must exist; if both sent, slug must match id. |
| `tenantSlug` | string | One of above | e.g. `zm` |
| `profession` | string | Yes | Service / trade (max ~120 server-side). |
| `city` | string | Yes | |
| `name` | string | Yes | Business name (Android `businessName`). |
| `phone` | string | Yes | Zambia format validated when tenant slug is `zm`. |
| `vat_or_pacra` | string | No | Max ~200. Web often sends `""`. Android maps **optional email** here for ops until a dedicated `email` field exists. |

### Success

`200` — `{ "ok": true }` ([`PostOkResponseDto`](android-ui-templates/kotlin/com/getpro/app/data/api/dto/PostOkResponseDto.kt))

### Errors

`400` / `403` — `{ "error": "string" }` (invalid tenant, missing fields, invalid phone, Israel gate, etc.)

### Android wiring

- DTO: [`BusinessOnboardingRequestDto`](android-ui-templates/kotlin/com/getpro/app/data/api/dto/BusinessOnboardingRequestDto.kt)
- Mapper: [`OnboardingSubmissionMapper.kt`](android-ui-templates/kotlin/com/getpro/app/data/mapper/OnboardingSubmissionMapper.kt) (`OnboardingSubmission` → DTO)
- API: [`BusinessOnboardingApiService`](android-ui-templates/kotlin/com/getpro/app/data/api/BusinessOnboardingApiService.kt) + [`FakeBusinessOnboardingApiService`](android-ui-templates/kotlin/com/getpro/app/data/fake/FakeBusinessOnboardingApiService.kt)
- Repository: [`RemoteBusinessOnboardingRepository`](android-ui-templates/kotlin/com/getpro/app/data/remote/RemoteBusinessOnboardingRepository.kt)
- Tenant: [`TenantConfig`](android-ui-templates/kotlin/com/getpro/app/data/TenantConfig.kt) (mirror `tenantId` + `tenantSlug` on the POST body)

See also **`docs/android-api-contracts.md`** §2.2.
