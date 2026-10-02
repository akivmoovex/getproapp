# ActiveClinic — Patient Privacy and Audit

**Prompt:** AC-V6-C01

## Data classification

**Administrative (this foundation):** name, DOB, sex at registration, contacts, address, identifiers, emergency contacts, registration status.

**Clinical (out of scope):** encounters, diagnoses, prescriptions, lab results, clinical notes.

## Privacy controls

- HCO ownership on every row + composite FKs  
- Facility visibility via links for facility-scoped actors  
- Patient number is displayable admin identifier, not a secret  
- Identifiers not globally searchable  
- Masked phone / email / identifier in list contexts  
- No patient login identity auto-created  
- No patient data copied to BlessBoard  
- No hard deletes  
- No unbounded search  
- No automatic merge  
- Production probes not added  

## Contact preferences (limited)

Optional administrative fields only: `preferred_contact_method`, `allow_admin_reminders`, emergency `consent_to_contact`.  
Nullable; never inferred. Clinical / guardian / marketing consent deferred.

## Audit events

| Action key | When |
|------------|------|
| `activeclinic.patient.create` | Registration success |
| `activeclinic.patient.update` | Demographics/contacts update |
| `activeclinic.patient.status_change` | Active/inactive |
| `activeclinic.patient.archive` | Archived |
| `activeclinic.patient.mark_deceased` | Deceased |
| `activeclinic.patient.identifier_add` / `_archive` | Identifier lifecycle |
| `activeclinic.patient.emergency_contact_add` / `_archive` | Emergency contacts |
| `activeclinic.patient.duplicate_warning` | Blocking duplicate without override |
| `activeclinic.patient.duplicate_override` | Override accepted |
| `activeclinic.patient.identifier_search` | Sensitive identifier search |

### Audit metadata allowlist additions

`patient_number`, `identifier_type`, `facility_key`, `match_strength`, `registration_method`, `override`, `search_kind` (+ existing field_keys / status / reason_code).

### Never audited in clear text

Full national IDs, passport values, passwords, session tokens, full patient payloads, clinical content, unnecessary full phone/email.

## Sex / gender

Only `sex_at_registration`: `male` | `female` | `intersex` | `unknown` | `not_recorded` (optional).  
Gender identity not collected in C01.
