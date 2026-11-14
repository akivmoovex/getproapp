# Document security changes

A clinical document read now joins the patient, facility, author, encounter, and finalizing staff only when those rows share the document’s organization. A document event is inserted only when `clinical_documents` contains that id in the same organization. If it does not, the audit event is not written.

Getting, updating, or finalizing a document with a caller patient id that is not the document’s patient still stops. A blank patient id does not widen the organization check. An unusable organization id still returns `organization_required` before a query.

No file was deleted. Quarantine, legal hold, page count, and a checksum were not added to the clinical document service. The stored title limit remains 200 characters and the body limit remains 20000. Final documents stay immutable in place.
