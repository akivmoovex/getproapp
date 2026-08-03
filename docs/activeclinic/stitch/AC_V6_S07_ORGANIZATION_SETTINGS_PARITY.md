# AC-V6-S07 — Organization Settings & Healthcare Profile

**Stage:** AC-V6-S07  
**Date:** 2026-08-03  
**Verdict:** `ACTIVECLINIC_V6_S07_ORGANIZATION_SETTINGS_PARTIAL`

No ActiveClinic Stitch screens exist for organization settings (inventory **STITCH_GAP**). Implementation is **functional / shell design-system** UI on the AC-V6-S02 shell. Visual parity is **VISUAL_BLOCKED**.

---

## Exact Stitch screens

| Exact Stitch name | Stitch ID | Form factor | Route | Status |
|---|---|---|---|---|
| *(none — Settings overview)* | — | Desktop | `GET /app/settings` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Settings overview mobile)* | — | Mobile | same URL | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Organization profile)* | — | D/M | `GET /app/settings/organization` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Edit organization)* | — | D/M | `GET …/edit`, `POST /app/settings/organization` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Facilities settings link)* | — | D/M | `GET /app/settings/facilities` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Access settings link)* | — | D/M | `GET /app/settings/access` → `/app/access` | **VISUAL_BLOCKED** / functional COMPLETE |
| *(none — Account settings)* | — | D/M | `GET /app/settings/account` | **VISUAL_BLOCKED** / functional COMPLETE |

---

## Routes and permissions

| Route | Permission |
|---|---|
| `GET /app/settings` | `activeclinic.access` |
| `GET /app/settings/organization` | `organization.view` |
| `GET /app/settings/organization/edit` | `organization.manage` |
| `POST /app/settings/organization` | `organization.manage` + CSRF |
| `GET /app/settings/facilities` | `facility.view` |
| `GET /app/settings/access` | `staff.assign_access` (redirect) |
| `GET /app/settings/account` | authenticated staff |

Nav item Settings now requires `activeclinic.access` so account settings remain reachable without manage.

---

## Settings information architecture

Permission-filtered cards:

1. Organization profile  
2. Facilities (summary + link)  
3. Staff (directory link when `staff.view`)  
4. Roles and access  
5. Account security  

Deferred / not invented: billing, subscriptions, clinical, pharmacy, lab, integrations, domain, deployment.

---

## Healthcare organization fields

Editable: `legal_name`, `public_name`, `organization_type`, `country_code`, `registration_number`, `timezone`  

Read-only: HCO status, product enrolment status, platform organization status  

Protected / ignored from client: organization ID, HCO ID, product enrolment, deployment, status, license number, ownership  

---

## Profile completeness

Deterministic checks (no percentage):

1. public name  
2. legal name  
3. country  
4. valid timezone  
5. organization type  
6. operational primary facility  
7. primary facility phone  
8. at least one active network administrator  

Labels: **Profile complete** / **Setup incomplete**.

---

## Status separation

Displayed separately:

- Healthcare organization status  
- ActiveClinic product-enrolment status  
- Platform organization status  

Ordinary settings forms cannot change any of these.

---

## Update behavior

- Session-scoped organization only  
- Status stripped unless `allowStatusChange` (not used by settings)  
- Registration optional; trim max 120; clearable  
- Timezone validated via `Intl` IANA check  
- Type allowlist enforced  
- Type-change warning: no automatic facility/staff changes  
- Audit: `activeclinic.healthcare_organization.update` with `field_keys`  

---

## Tests

```bash
node --test tests/activeclinic-organization-settings-parity.test.js
```

---

## Intentional differences / gaps

- **VISUAL_BLOCKED** — no Stitch settings designs  
- No branding / logo upload  
- No HCO status transition screen  
- Primary facility selection remains in facilities module  
- S01–S06 visual PARTIAL gaps unchanged  

---

## Gate for next wave

S07 reaches non-blocking **PARTIAL**. Recommended next:

**AC-V6-S08 — Foundation Empty, Error and Restricted States**
