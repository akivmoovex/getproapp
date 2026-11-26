# G229 radiology QA

Stored request statuses used by the journey are `pending`, `in_progress`,
`completed`, `reported`, `verified`, `released`, and `cancelled`. Report
entry is allowed only for `pending`, `in_progress`, and `completed`. Entering
a report sets the request to `reported`. A second staff member with
`activeclinic.radiology.verify` (or legacy diagnostics verify) verifies the
report and moves the request to `verified`.

Covered and executed:

- clinician radiology order creates a facility-scoped request;
- open queue excludes `reported` and `verified`;
- reported tab and dashboard counters include `reported`;
- report entry rejects wrong-patient and closed statuses;
- self-verify is denied; foreign clinic cannot read the report;
- second staff verifies; request and report statuses become `verified`;
- clinician encounter shows the same-patient findings via
  `data-ac-rad-readback`;
- print control is present on the recorded report.

Evidence: unit filters (`g224-diagnostics-filters`), scripted service denials
(`d66`, `d74`), HTTP `runG229Radiology`, and Playwright G229.
