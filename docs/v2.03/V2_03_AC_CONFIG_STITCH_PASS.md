# V2.03 AC Batch 1A — Configuration Stitch Pass

**Verdict:** `COMPLETE_WITH_GAPS`

**Stitch project:** `projects/12134201997833374170`  
**Branch:** V10  
**Scope:** ACN01–ACN05 (Clinic Setup Checklist, Services & Pricing, Add/Edit Service, Practitioners Directory, Practitioner Profile & Availability)

## Delivered

| Screen | Route | Status |
|--------|-------|--------|
| ACN01 Clinic Setup Checklist | `GET /app/onboarding` (existing) | Extended — `clinical_services` + `practitioners` items derived from persisted service counts and practitioner profile/availability |
| ACN02 Services & Pricing | `GET /app/services` | Implemented — ops catalogue on `appointment_service_types` + assignments |
| ACN03 Add/Edit Service | `GET/POST /app/services`, `/app/services/:id/edit` | Implemented — name, description, duration, price, follow-up, buffer, location, practitioners, active/bookable |
| ACN04 Practitioners Directory | `GET /app/practitioners` | Implemented — filters, stats, credentials/specialty, weekly summary, public visibility |
| ACN05 Practitioner workspace | `GET/POST /app/practitioners/:id` | Implemented — profile/credentials, weekly schedule, leave/blocked periods; RBAC guardrail copy |

### Domain persistence (additive migration `036_batch1a_services_practitioners.sql`)

- `appointment_service_types`: `amount_minor`, `currency_code`, `follow_up_amount_minor`, `buffer_minutes`, `facility_id`
- `service_staff_assignments` (service ↔ practitioner; does **not** grant app RBAC)
- `staff_members`: `credentials_text`, `license_number`, `specialties_json`, `public_bookable`
- `staff_weekly_availability`, `staff_availability_blocks`

### Platform reuse

- `listQuery`, shared validation, forged-tenant rejection, existing CSRF/shell/RBAC, website catalogue create/update for core service identity

### Tests

- `tests/activeclinic-batch1a-config.test.js` — views/CSS/migration markers, checklist derivation, forged-tenant, persistence, tenant isolation, HTTP Stitch markers, receptionist denied service create

## Gaps (intentional / deferred)

1. **Dual catalogue preserved** — Billing `charge_catalogue_items` and website CMS catalogue remain; ACN02/03 write the ops service-type catalogue with pricing. No automatic sync to billing charge items.
2. **Stitch visual fidelity** — Layout/CSS aligned to Batch1A shell patterns (stats, table/cards, 390px cards) but not pixel-perfect Tailwind/Stitch HTML port; Material Symbols / exact Stitch sidebar chrome rely on existing AC shell.
3. **ACN01 Stitch 8-step marketing cards** (logo/letterhead, publication gate simulator, resilience sidebar) not rebuilt as cosmetic tasks — checklist remains fact-driven from persisted configuration.
4. **Facility multi-select on services** — Stitch shows multiple clinical rooms; V10 stores a single primary `facility_id` (additive). Multi-location assignment can extend later without breaking this shape.
5. **Practitioner facility assignment UI** — locations shown from existing staff–facility assignments; editing assignments stays on `/app/staff` (no parallel legacy system).

## Regression notes

- `/app/staff` HR directory and `/app/settings/website/catalogue` CMS paths unchanged
- Practitioner profile fields do not assign roles or permissions
