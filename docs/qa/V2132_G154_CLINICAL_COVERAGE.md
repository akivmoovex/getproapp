# G154 clinical coverage

Approved clinical behavior that this cycle re-executed:

- Practitioner worklist and start encounter (`AC-FU-CLIN-01`, `AC-FU-REC-05`).
- Heart-rate entry, unit `bpm`, reload, correction to 80 with reason `entry error`, original 72 still visible, superseded marker visible.
- An unauthenticated session cannot write 140 bpm onto that encounter.
- HTTP stale correction of an already superseded row stays rejected in the existing HTTP case.
- Receptionist denials: worklist, documents, pharmacy, laboratory, billing.
- Laboratory reference-rule preview is not saved.
- Prescription editor explains the pharmacy queue and does not claim a dispense.

Not driven in the browser this cycle:

- Creating and signing a consultation note. The POST route exists and requires a consultation id. No note fixture was invented.
- Completing a stocked dispense. The HTTP proof denies a dispense outside the organization. No stock batch was seeded.
- Laboratory result entry. The approved boundary is the denial and the unsaved reference-rule preview.

Corrections append. The original observation remains on the page after the correction and after the denied stranger post. No migration was applied. Vitals use the existing correction columns.
