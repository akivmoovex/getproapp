# ActiveClinic V6 — Login Eligibility

**Stage:** AC-V6-08

Successful password verification alone is insufficient.

## Chain

1. Active `platform.identities` row (not locked/suspended; temporary lock respected)
2. Active ActiveClinic deployment (`activeclinic-org-v6`)
3. Active `identity_product_profiles` link (`activeclinic_staff` → staff id)
4. Active platform organization
5. Active ActiveClinic organization enrolment
6. Active healthcare organization
7. Active `staff_members` row linked to the identity
8. At least one non-expired active staff role assignment
9. Effective permission includes `activeclinic.access`
10. Valid facility scope: organisation-wide/network admin **or** ≥1 active facility assignment

## Organization selection

- One eligible org → session created immediately
- Multiple → auth-transfer selection (`/login/select-organization`); client org ids revalidated
- Zero → generic access-unavailable

## Facility context

- Network / organisation-scoped staff may enter without facility selection
- Single facility assignment may default in context
- Multiple facilities selectable later inside `/app` (not forced at login)
- No facility + no org-wide access → denied at eligibility
