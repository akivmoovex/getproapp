# Nursing and consultation gaps

Vitals are inserted with the supplied number, text, and unit. The service does not compare systolic or diastolic with a threshold. The only numeric bound found for nursing input is `pain_level` from 0 through 10 on `triage_assessments`. That is a form bound, not a diagnostic range. No blood-pressure, pulse, or temperature range is approved, and none was added.

Triage category values in the migration are `emergency`, `urgent`, `semi_urgent`, and `non_urgent`. The table comment says category assignment is manual. Allergies remain free text.

A signed consultation note cannot be edited in place. An amendment still needs a reason, an author, and a writer. Those fields are not approved, so no writer was added.

Cross-tenant observation reads were not executed. `NUR-01-03` stays partial.
