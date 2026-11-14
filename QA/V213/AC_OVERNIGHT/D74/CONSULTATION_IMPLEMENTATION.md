# Consultation implementation

A later write now loads a signed note for the same encounter ahead of a draft. The write stops with `cannot_edit_signed` and does not insert or update a note. The original author column is not reassigned.

A draft whose patient is not the encounter’s patient is not updated. The draft update also requires that patient id. No amendment record was added.
