# ActiveClinic — Clinic Registration Field Contract

**Date:** 2026-08-04  

## Path

`GET/POST /register-clinic`  
→ CSRF + rate limit  
→ `validateClinicRegistrationInput` / `createClinicRegistrationApplication`  
→ `activeclinic.clinic_registration_applications`  
→ `303 /register-clinic/success?ref=…` or mapped error page

## Field matrix

| HTML name | Type | Normalized | Service arg | SQL column | Required | Limits |
|-----------|------|------------|-------------|------------|----------|--------|
| `clinicName` | text | trim | `clinicName` | `clinic_name` | yes | 2–200 |
| `contactName` | text | trim | `contactName` | `contact_name` | yes | 2–120 |
| `contactEmail` | email | lower | `contactEmail` | `contact_email_normalized` + `_display` | yes | ≤254 |
| `contactPhone` | tel | E.164 ZM | `contactPhone` | `contact_phone_normalized` + `_display` | yes | E.164 |
| `province` | text | trim / null | `province` | `province` | no | ≤100 |
| `city` | text | trim / null | `city` | `city` | no | ≤100 |
| `countryCode` | hidden | `ZM` default | `countryCode` | `country_code` | yes (defaulted) | CHAR(2) |
| `notes` | textarea | trim / null if blank | `notes` | `notes` | no | null or 1–2000 |
| `action` | hidden | `confirm` on review | — | — | review only | — |
| `_csrf` | hidden | — | CSRF | — | yes | — |

## Rejected / not accepted from public form

`status`, `organizationId`, `healthcareOrganizationId`, `facilityId`, `reviewed_by_*`, product enrollment, publication flags.

## Status values

Insert always uses `pending_review`. Allowed CHECK: `pending_review`, `approved`, `rejected`, `withdrawn`, `duplicate`.

## Duplicate rule

Same `contact_email_normalized` within 30 days with status not in (`rejected`, `withdrawn`) → `duplicate_application` (no second row).
