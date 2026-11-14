# Document security

A patient-visible laboratory or radiology result already had to be `released` and belong to the caller’s organization and patient. The request and the facility were joined by id only. Those joins now also require the same organization as the result. An unreleased row still does not appear. A modality other than laboratory or radiology still returns `invalid_input` before a query.

Clinical document reads and events stay as D42 left them: the patient, facility, author, encounter, and finalizer must share the document’s organization, and a document event is inserted only for a document in that organization. The document service still has no quarantine state, page count, or checksum. No file was deleted.
