# V2.04-QA-03 — Platform registration country availability

| Field | Value |
|---|---|
| VERSION | 2.04 |
| BRANCH | V4 |
| QA_DEFECT | V2.04-QA-03 |
| PRE_FIX_APPLICATION_SHA | `c55f65570863e6b4d12b16a9b122fc486a2a9999` |
| DEPENDS_ON | V2.04-QA-01 (PASS), V2.04-QA-02 (PASS) |

## Objective

Centralize registration country availability in shared platform geography for BlessBoard and ActiveClinic.

Countries are **product-supported markets**, not demographic classifications. No religion fields.

## Audit (pre-fix)

| Source | Location |
|---|---|
| BB_COUNTRY_SOURCE | `listPhoneCountries()` via `registrationCountrySelection.listRegistrationCountries` (full libphonenumber set) |
| AC_COUNTRY_SOURCE | same shared module (full phone catalogue) |
| PLATFORM_COUNTRY_SOURCE | `platform.geographic_countries` (QA-02; city catalogue flags only) |

Product-local hard-coded registration country lists: none found (already shared), but the shared module was not platform-availability gated.

## Shared architecture (after)

```
platform.geographic_countries.registration_enabled
        ↓
hydrateRegistrationCountryAvailability(db)
        ↓
registrationCountrySelection.listRegistrationCountries
        ↓
buildRegistrationPageLocals / normalizeRegistrationCountryCode
        ↓
BB + AC registration UI + server validation

GET /api/locations/countries  (shared endpoint)
```

Phone calling-code metadata is still reused from the shared phone catalogue **for enabled ISO codes only**.

| Gate | Result |
|---|---|
| SHARED_COUNTRY_SOURCE | 1 |
| BB_PRODUCT_COUNTRY_LIST | 0 |
| AC_PRODUCT_COUNTRY_LIST | 0 |
| SHARED_CITY_AUTOCOMPLETE_ENGINE | 1 (unchanged) |
| SHARED_CITY_REPOSITORY | 1 |
| SHARED_CITY_SERVICE | 1 |

## Schema

Migration: `db/migrations/platform/045_registration_country_availability.sql`

Adds:

- `platform.geographic_countries.registration_enabled BOOLEAN NOT NULL DEFAULT FALSE`
- index on `(registration_enabled, is_active)`

Seeds/updates the 19 V2.04 markets with `registration_enabled = TRUE`.

No religion / demographic columns.

## Initial enabled markets (19)

ZM, ZW, BW, NA, ZA, LS, SZ, MW, MZ, KE, UG, TZ, RW, BI, US, CA, GB, AU, NZ

```
REGISTRATION_ENABLED_COUNTRIES=19
```

Bootstrap mirror (fallback before DB hydrate):  
`src/platform/geography/registrationEnabledMarkets.js`

## Enforcement

- **UI:** registration dropdowns use `registrationCountries` from platform-enabled list.
- **Server:** `normalizeRegistrationCountryCode` / `validateChurchCountry` / `validateClinicRegistrationInput` reject non-enabled countries (e.g. forged `FR` POST).
- **Existing data:** availability gates new registration only; stored org/clinic rows outside the set are not rewritten.

## City catalogue integration

Enabled markets with catalogue coverage continue to use:

`GET /api/locations/cities`

No city-data duplication.

## Future country enablement (data-driven)

To enable another country **without** BB/AC application-code changes:

1. `INSERT`/`UPDATE` `platform.geographic_countries`  
   set `registration_enabled = true`, `is_active = true`  
   (optionally `city_catalogue_enabled` + seed cities)
2. Restart the app **or** call `hydrateRegistrationCountryAvailability(db)`
3. Confirm `/api/locations/countries` and registration dropdowns

Optional later: `platform.product_country_availability` if BB and AC must diverge.

## Tests

- `tests/v2-04-qa-03-platform-country-availability.test.js`
- Updated `tests/v7-shared-registration-country-selection.test.js`

Covers: enabled list, BB/AC HTML lists, forged disabled-country rejection, city autocomplete, representative registration countries, data-driven enablement docs.

## Migration status

| Item | Value |
|---|---|
| MIGRATION | `db/migrations/platform/045_registration_country_availability.sql` |
| TESTING_MIGRATION | PASS |
| PRODUCTION_MIGRATION | PENDING |

## Release impact

Creates a new V2.04 application candidate after `c55f6557…`. Hosted QA required before freeze. No automatic deploy.
