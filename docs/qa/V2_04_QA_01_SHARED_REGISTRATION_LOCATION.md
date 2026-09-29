# V2.04-QA-01 — Shared registration location (Country + City)

| Field | Value |
|---|---|
| VERSION | 2.04 |
| BRANCH | V4 |
| QA_DEFECT | V2.04-QA-01 |
| SEVERITY | P1 UX / PLATFORM CONSISTENCY |
| PRE_FIX_APPLICATION_SHA | `117b03ef4b96bb1e859190dcb10fa7d3035e045f` |
| TITLE | Move registration location fields to platform level and add shared city autocomplete to ActiveClinic |

## Original defect

BlessBoard registration provided country-aware city autocomplete. ActiveClinic registration did not share equivalent behavior, still exposed Province/Region on the normal registration flow, and product-local autocomplete markup/CSS drifted from the platform engine.

V2.04 registration should show **Country + City** only. Province/region columns and existing stored values must be preserved.

## Audit (pre-fix)

### BlessBoard

| Item | Location |
|---|---|
| Registration route | Apex `/register-church` via `src/blessboard/http/renderApexMarketing.js` |
| Registration template | `views/blessboard/v5/apex/register-church.ejs` |
| Country field | `#register_country` select (shared catalogue) |
| City field | `#register_city` combobox |
| City autocomplete JS (original) | `public/blessboard/v5/register-church-location.js` (thin wrapper around platform engine) + `public/platform/location-autocomplete.js` |
| City data source | `GET /api/locations/autocomplete` → `platform.geographic_locations` |
| Validation | `src/blessboard/services/platformChurchRegistrationValidation.js` (country + city required; no province on registration) |
| Persistence | Church/org registration payload `country`, `city` (+ optional `locationId`) |

### ActiveClinic

| Item | Location |
|---|---|
| Registration route | `/register-clinic` via ActiveClinic public routes |
| Registration template | `views/activeclinic/public/register-clinic.ejs` |
| Location fields (original) | Country, City (partial autocomplete), **Province/Region**, Address |
| Country handling | Shared catalogue via `registrationCountrySelection` |
| City handling | Platform `GpLocationAutocomplete` init inside `public/activeclinic/register-clinic.js` with AC-local `acw-location-*` markup/CSS |
| Province/region | Visible Zambia select + free-text for other countries |
| Validation | `validateClinicRegistrationInput` — province optional when empty; invalid Zambia province rejected |
| Persistence | `country_code`, `city`, `province`, `address`, optional `locationId` |

### Shared infrastructure discovered

| Item | Location |
|---|---|
| Autocomplete engine | `public/platform/location-autocomplete.js` |
| Autocomplete CSS | `public/platform/location-autocomplete.css` |
| Field partial | `views/platform/partials/gp-location-field.ejs` |
| Field init | `public/platform/gp-location-field-init.js` |
| Geography service | `src/platform/geography/locationService.js` |
| API routes | `src/platform/http/platformLocationRoutes.js` |
| Country selection | `src/platform/registration/registrationCountrySelection.js` |

**Pre-fix markers:**

```
BB_CITY_AUTOCOMPLETE_IMPLEMENTATION=public/blessboard/v5/register-church-location.js + public/platform/location-autocomplete.js
AC_CITY_AUTOCOMPLETE_IMPLEMENTATION=public/activeclinic/register-clinic.js + public/platform/location-autocomplete.js (+ acw-location CSS)
CURRENT_SHARED_LOCATION_COMPONENT=public/platform/location-autocomplete.js + views/platform/partials/gp-location-field.ejs
LOCATION_DATA_MODEL_AUDIT=PASS
```

## Shared architecture (after)

New registration location contract module:

- `src/platform/registration/location/index.js`

Shared browser surface (single engine):

- `public/platform/location-autocomplete.js` — country-aware fetch, keyboard selection, custom “Add …” option, **clears city on country change**, `.gp-location-*` classes only (no product class leak)
- `public/platform/gp-location-field-init.js` — initializes `[data-gp-location-init]`
- `views/platform/partials/gp-location-field.ejs` — reusable field shell
- `public/platform/location-autocomplete.css` — semantic tokens only (`--color-*`, `--card-*`)

Both products consume the same partial + engine. Product templates supply local input/label classes so BB keeps violet identity and AC keeps teal (`#006068`) via `data-product` token remaps.

## Product migrations

### BlessBoard

- `register-church.ejs` now includes `gp-location-field`
- Removed product-specific `public/blessboard/v5/register-church-location.js`
- Apex shell loads platform location JS/CSS via `V204_BROWSER_ASSET_VERSION`

### ActiveClinic

- Registration clinic step uses the same `gp-location-field` partial
- Province/Region removed from visible registration UI
- Hidden `province` may still travel empty through later steps (non-destructive)
- Removed AC-local `.acw-location-*` CSS engine from `acw-platform.css`
- `register-clinic.js` no longer owns autocomplete business logic
- City required on clinic registration validation; province not required

## Province / region decision

| Rule | Result |
|---|---|
| Visible in registration | **NO** |
| Required in registration | **NO** |
| DB columns / stored values | **PRESERVED** |
| Invalid province when supplied | Still rejected by `validateProvinceForCountry` |
| Schema migration | **None** (UI/validation only) |

Neutral shared concept for optional admin area remains `provinceRegion` / existing product fields (`province`, `provinceState`). No Zambia-specific schema rename.

## Data compatibility

Existing BB/AC records with city and province/region continue to load. Registration no longer writes province unless a legacy/hidden value is still submitted. Autocomplete `locationId` resolution remains country-scoped so a Zambia location id cannot bind under another country.

## Design / token isolation

| Check | Result |
|---|---|
| Shared CSS raw `#6c5ce7` / `#006068` | 0 |
| Shared JS product class `acw-location-*` | 0 |
| AC primary via product tokens | `#006068` |
| BB primary via product tokens | `#6c5ce7` |

## Cache versioning

Bumped centralized stamp:

```
V204_BROWSER_ASSET_VERSION=v204-qa-2
```

in `src/platform/ui/theme/browserAssetVersion.js`, and aligned hardcoded fallbacks that must match the stamp.

## Duplication audit (after)

| Metric | Count |
|---|---|
| BB_PRODUCT_SPECIFIC_CITY_ENGINE | 0 |
| AC_PRODUCT_SPECIFIC_CITY_ENGINE | 0 |
| SHARED_CITY_AUTOCOMPLETE_ENGINE | 1 |

## Tests

Focused coverage: `tests/v2-04-qa-01-shared-registration-location.test.js`

Also updated:

- `tests/v7-shared-registration-country-selection.test.js`
- `tests/activeclinic-platform-03.test.js` (registration markup expectations)
- `tests/activeclinic-platform-02.test.js` (province UI removed)

Representative suites run: QA-01, shared country selection, static asset versioning, AC clinic registration, AC registration terms, V7 bugs 1–4, AC platform 02.

## Release impact

This is a **QA-found application change** after freeze of `117b03ef…`. It creates a **new application candidate** that must undergo focused hosted QA before V2.04 can be frozen again.

- Do **not** treat this as automatic Neuniversity / production deploy
- PRONLINE V10 preserved
- Production untouched

No credentials are included in this report.
