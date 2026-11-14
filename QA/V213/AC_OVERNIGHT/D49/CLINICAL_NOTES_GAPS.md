# Clinical notes gaps

A signed consultation note still returns `cannot_edit_signed`. Signing still sets `signed_by_staff_id` and `signed_at` only when the note is a draft in the caller’s organization. The signed text is not rewritten.

The amendment table is unused. An amendment writer needs an approved reason, the author, and a rule that the signed body stays unchanged. That approval is not in the register. No migration was added.

The audit event for a signed note still has no `purpose` field. Adding one would be a new metadata contract.

SOAP text is still trimmed to the stored lengths: 5000 for the four SOAP fields, 3000 for additional notes, 8000 for history, and 4000 for medication, follow-up, and referral.
