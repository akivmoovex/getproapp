# ActiveClinic — Patient Search and Facility Scope

**Prompt:** AC-V6-C01

## Service

`searchActiveClinicPatients(...)`

## Searchable inputs

- Patient number (exact)
- Name prefix (minimum length 2 for broad text search)
- Normalized phone
- Date of birth
- Identifier type + value (requires identifier/sensitive permission; audited)
- Facility filter
- Status (archived excluded by default)

## Result minimization

Search summaries include: patient id (routing), patient number, display name, approximate age, optional DOB, masked phone, status, optional facility summary.

Excluded: full address, full national ID / passport, emergency contacts, clinical history.

## Organization scope

HCO + organization filters are mandatory on every query path.

## Facility scope policy

| Actor | Visibility |
|-------|------------|
| Organisation-scoped / network admin | All patients in HCO |
| Facility-scoped admin | Only patients with active `patient_facility_links` to authorized facilities |
| Staff (default role) | No patient permissions |

Selected facility alone is **not** authorization; effective permissions + facility assignment apply.

### Edge cases

- Patient registered at A, later linked at B → facility actors at A or B may see once linked  
- Patient with no facility link → facility-scoped actors cannot see; org-wide can  
- Archived facility does not grant new access; historical links retained  
- Future appointment/encounter may create `seen_at` links (not in C01)

## Pagination

Explicit `limit` (max 100) and `offset`. Safe sort: last name, first name, patient number.

## Performance notes

Indexes cover HCO+number, phone, email, DOB, name (`lower(last_name), lower(first_name)`), identifier type/value, facility links. Broad leading-wildcard scans are not supported.
