# Android / API — company profile (read)

Aligned with web: **`GET /company/:id`** (SSR today) and proposed **`GET /api/v1/companies/:idOrSlug`** (JSON).

## Contract

| | |
|--|--|
| **Method** | `GET` |
| **Path** | `/api/v1/companies/{idOrSlug}` |
| **idOrSlug** | Numeric company id **or** public slug (same disambiguation rules as product). |
| **Auth** | Public |
| **Tenant** | Host / `X-Tenant-Slug` / `X-Tenant-Id` (match SSR tenant resolution). |

### Success `200`

JSON matches `CompanyProfileDto` in `docs/android-ui-templates/kotlin/com/getpro/app/data/api/dto/CompanyProfileDto.kt`: business name, category, city, about, services, phone, optional WhatsApp URL, reviews, optional rating aggregates, optional logo/hero URLs.

### Errors

- `404` — `{ "error": "..." }` (unknown id/slug)
- `5xx` — server error

## Android mapping

`CompanyProfileDto` → `DtoToUiMappers.companyProfile` → `ProfileUiModel` → `ProfessionalProfileScreen`.

See also `docs/android-api-contracts.md` §3.3.
