# G168 ActiveClinic coverage

Both Playwright cycles passed 29 tests. The new journey is `G168 consultation draft is signed on complete and another clinic cannot change it`.

What that journey does, on the disposable database:

- An administrator creates a patient and starts an encounter. The administrator page says clinical notes cannot be edited. That matches the role contract: organisation administration does not include `activeclinic.consultation.record`.
- The clinician signs in, opens that encounter, and saves a chief complaint.
- The note row is `draft`, the text matches, and `signed_at` is null.
- A prescription is saved with no catalogue id. One clinical order exists. `pharmacy_prescriptions` for that encounter stays 0. The page says the order is not on the pharmacy queue.
- Clinic B's administrator does not see the complaint field or the complaint text. A post to the consultation URL does not change the draft.
- Complete signs the note. Status is `signed`, the original text is unchanged, and `signed_at` and `signed_by_staff_id` are set. The pharmacy count stays 0. The reopened encounter shows the complaint and has no save-draft control.

Also re-executed: patient search, duplicate phone search, portal activation, wrong-clinic portal denial, walk-in, queues, vitals correction, website publish, themes, and disabled public booking.

A stocked dispense was not run. No inventory batch was seeded, and no capacity or catalogue item was invented. The blank-catalogue result is the approved boundary.
