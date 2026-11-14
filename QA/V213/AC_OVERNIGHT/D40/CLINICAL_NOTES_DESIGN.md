# Clinical notes design

A signed note still returns `cannot_edit_signed`. The sign and draft updates now also require the caller's organization and `status = 'draft'`, so a signed row is not rewritten in place.

`consultation_note_amendments` exists in the schema. No service inserts into it. An amendment writer needs an approved reason, author, and the rule that the signed body stays unchanged. That approval is not in the register. No migration was added.

Provenance that already exists on a recorded note: organization, healthcare organization, facility, encounter, patient, and `created_by_staff_id`. Signing stores `signed_by_staff_id` and `signed_at`. The audit action remains `activeclinic.consultation.signed` with the encounter id. It does not claim a legal purpose.
