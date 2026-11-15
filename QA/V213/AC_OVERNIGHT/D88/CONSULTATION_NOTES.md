# Consultation notes

No clinical service file was changed. `recordConsultationNote` still orders a signed note ahead of a draft and returns `RESULT.CANNOT_EDIT_SIGNED` when that row is signed. The draft update still requires `status = 'draft'` and the encounter patient's id. The function does not contain an amendment.

An amendment reason and author are not approved, so no amendment record was added. The signed text is not rewritten.
