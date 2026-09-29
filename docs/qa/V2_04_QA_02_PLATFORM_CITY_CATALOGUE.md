# V2.04-QA-02 — Platform database-backed city catalogue

| Field | Value |
|---|---|
| VERSION | 2.04 |
| BRANCH | V4 |
| QA_DEFECT | V2.04-QA-02 |
| PRE_FIX_APPLICATION_SHA | `ee662705b04b8a281bc6568e7492481221f412c0` |
| DEPENDS_ON | V2.04-QA-01 (PASS) |

## Objective

Add a **platform-level**, database-backed city catalogue consumed by the existing QA-01 shared autocomplete for BlessBoard and ActiveClinic.

No religion fields. Neutral concepts only:

- `city_catalogue_enabled`
- `catalogue_status`
- `supported_country` (via `geographic_countries`)

## Audit (QA-01)

| Item | Result |
|---|---|
| SHARED_CITY_AUTOCOMPLETE_ENGINE | 1 |
| CURRENT_CITY_DATA_SOURCE | `platform.geographic_locations` via `GET /api/locations/autocomplete` |
| CURRENT_CITY_LOOKUP_FLOW | Browser `GpLocationAutocomplete` → platform route → `locationService.autocompleteLocations` → `locationRepository.searchLocations` |
| EXISTING_COUNTRY_TABLE | NONE (pre-QA-02); countries came from phone catalogue in code |
| EXISTING_CITY_TABLE | `platform.geographic_locations` (platform/034; Zambia seed only) |

QA-01 architecture was **extended**, not replaced.

## Architecture

```
platform.geographic_countries
platform.geographic_locations
        ↓
locationRepository (shared)
        ↓
locationService (shared)
        ↓
GET /api/locations/cities  (alias: /api/locations/autocomplete)
        ↓
public/platform/location-autocomplete.js
        ↓
BB registration + AC registration
```

| Component | Path |
|---|---|
| SHARED_CITY_REPOSITORY | `src/platform/geography/locationRepository.js` |
| SHARED_CITY_SERVICE | `src/platform/geography/locationService.js` |
| SHARED_CITY_LOOKUP_ENDPOINT | `GET /api/locations/cities` |
| SHARED_CITY_AUTOCOMPLETE_ENGINE | `public/platform/location-autocomplete.js` (count=1) |

Product-local engines/data: **0**.

## Schema

### `platform.geographic_countries`

- `country_code` (ISO-2 PK)
- `country_name`
- `city_catalogue_enabled`
- `catalogue_status` (`none` \| `seeded` \| `partial` \| `complete`)
- `is_active`
- timestamps

### `platform.geographic_locations` (extended)

Existing columns retained. Added:

- `is_active`
- `latitude` / `longitude` (optional)
- `external_ref` (GeoNames id when seeded)
- `updated_at`
- `disambiguator` (generated from `COALESCE(province_region,'')`)

Uniqueness: `(country_code, normalized_name, disambiguator)` so same-name cities in one country remain distinguishable when administrative area exists.

Indexes:

- `uq_geographic_locations_country_normalized_admin`
- `idx_geographic_locations_country_normalized_prefix` (`text_pattern_ops` for prefix `LIKE`)
- `idx_geographic_locations_active_country`

`province_region` remains **optional** (administrative area). Registration UI still does not require or show province/region (QA-01 decision preserved).

## Initial supported city-catalogue markets

19 countries:

**Southern Africa:** ZM, ZW, BW, NA, ZA, LS, SZ, MW, MZ  
**Eastern Africa:** KE, UG, TZ, RW, BI  
**International:** US, CA, GB, AU, NZ

```
INITIAL_CITY_CATALOGUE_COUNTRIES=19
INITIAL_CITY_CATALOGUE_COUNTRY_CODES=AU,BI,BW,CA,GB,KE,LS,MW,MZ,NA,NZ,RW,SZ,TZ,UG,US,ZA,ZM,ZW
```

## City data source

| Field | Value |
|---|---|
| CITY_DATA_SOURCE | GeoNames `cities15000` dump (major populated places ≥15k), filtered to initial markets; Zambia towns from platform/034 retained/supplemented |
| CITY_DATA_LICENSE | Creative Commons Attribution 4.0 (CC BY 4.0) |
| CITY_DATA_VERSION | geonames-cities15000-2026-09-29 (imported 2026-09-30) |
| Packaged seed | `src/platform/geography/seed/cityCatalogueSeed.json` |
| SQL seed | `db/seeds/010_platform_city_catalogue.sql` |

No website scraping. Deterministic packaged seed committed to the repository.

## Record counts (seed package)

| Metric | Count |
|---|---|
| COUNTRIES_WITH_CITY_CATALOGUE | 19 |
| TOTAL_CITY_RECORDS (seed) | 516 |

Per-country seed counts:

ZM 31, ZW 25, BW 25, NA 19, ZA 25, LS 11, SZ 3, MW 23, MZ 25, KE 25, UG 25, TZ 25, RW 25, BI 14, US 80, CA 40, GB 40, AU 35, NZ 20

Known catalogue gap: Eswatini (SZ) has few GeoNames ≥15k places (3). Coverage is still usable; expansion can raise density later without blocking registration.

## Fallback behavior

If `city_catalogue_enabled` is false / country missing from `geographic_countries`:

- Autocomplete returns `catalogueEnabled: false` and empty results
- City remains a normal free-text field
- Registration succeeds with typed city (`source: manual`)
- Legacy free-text org/facility cities remain valid
- Optional `locationId` continues to work when selected from catalogue

## BB / AC integration

Both products continue to use:

- `views/platform/partials/gp-location-field.ejs`
- `GpLocationAutocomplete` / `gp-location-field-init.js`

Visual identity remains product-token driven. Province/Region stays hidden on registration.

## Migration

| Item | Value |
|---|---|
| CITY_CATALOGUE_MIGRATION | `db/migrations/platform/044_city_catalogue.sql` |
| TESTING_MIGRATION | PASS (applied via foundation migrate + seed 010) |
| PRODUCTION_MIGRATION | PENDING (do not apply automatically) |

Forward-only, non-destructive. Existing Zambia rows preserved; unique key widened to include admin disambiguator.

## Cache versioning

```
V204_BROWSER_ASSET_VERSION=v204-qa-3
```

Advanced once for QA-02 browser JS route/label/catalogue behavior changes.

## Tests

`tests/v2-04-qa-02-platform-city-catalogue.test.js`

Coverage: DB lookup, country filter, prefix match, normalization, duplicates, limits, invalid inputs, unsupported-country fallback, BB/AC integration, legacy free-text, security, duplication gate.

Also re-ran QA-01 shared registration location suite and ActiveClinic platform 02 location tests.

## Release impact

Creates a **new application candidate** after `ee662705…`. Requires focused hosted QA before V2.04 freeze.

- Neuniversity deploy: PENDING  
- PRONLINE V10 preserved  
- Production untouched  
