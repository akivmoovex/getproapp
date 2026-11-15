# Document scanning

Document read, draft update, and finalization stay in the stored facility. The repository predicates are `facility_id = $9` and `facility_id = $5`. An empty `clinical_attachment` is rejected before a query.

The document service has no `sha256`, no quarantine state, and no `mergePatient`. D21-09 is pending, so no scan-import hash and no uncertain-match quarantine were added. No patient file was read.
