# ActiveClinic — Clinic Directory Query Contract

**Date:** 2026-08-04  

## Function

`listPublishableClinics(db, { search, province, city })`

## Publication predicates (all required)

| Condition | SQL |
|-----------|-----|
| Organization active | `o.status = 'active'` |
| Product enrollment active | `op.status = 'active'` |
| Product is ActiveClinic | `p.product_key = 'activeclinic'` |
| Healthcare org active | `h.status = 'active'` |
| Website published | `h.website_published = true` |
| Facility active + directory | `EXISTS` facility with `f.status = 'active' AND f.show_in_directory = true` |

## Optional filters

| Input | Behavior |
|-------|----------|
| `search` / `q` (≥2 chars) | `h.public_name ILIKE %term%` parameterized |
| `province` | facility province equality |
| `city` | facility city equality |

## Public card fields only

`clinicKey`, `publicName`, `websiteTagline`, `websiteLogoUrl`, `publicPhoneDisplay`, `publicEmailDisplay`, `publicBookingEnabled`, `facilityCount`

No internal staff IDs, unpublished services, or capacity internals.

## HTTP outcomes

| Situation | Status | State |
|-----------|--------|-------|
| Published clinics | 200 | ready + cards |
| Zero published | 200 | empty |
| Filters no match | 200 | empty (no-match copy) |
| Repository/SQL failure | 503 | error + request ID |

Never coerce repository exceptions into an empty success list.
