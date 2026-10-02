# ActiveClinic — Patient Duplicate Detection

**Prompt:** AC-V6-C01

## Principle

Duplicate detection is a **warning + governed override** workflow.  
There is **no automatic merge** in this phase.

## Service

`findPotentialPatientDuplicates(...)` → controlled match summaries (never raw PII dumps).

## Signals

| Strength | Signals | Blocks registration? |
|----------|---------|----------------------|
| Strong | Same live identifier type+value within HCO | Yes (unless override) |
| Moderate | Phone + similar name; name + DOB; email + similar name | Yes (unless override) |
| Weak | Name only | No (informational) |

Identifier uniqueness conflicts may also return `identifier_conflict` before/alongside duplicate warning.

## Override

- Requires explicit `duplicateOverride: true`
- Requires `activeclinic.patient.duplicate_override`
- Audited as `activeclinic.patient.duplicate_override`
- Warning without override audited as `activeclinic.patient.duplicate_warning`

## Merge

`mergeActiveClinicPatients` is reserved and returns `merge_deferred`.  
Permission `activeclinic.patient.merge` exists in catalogue but is **unassigned**.

## Scope

Organization / HCO only. Cross-HCO candidates are never returned.
