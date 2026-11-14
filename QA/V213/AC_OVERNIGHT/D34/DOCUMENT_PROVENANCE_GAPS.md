# Document provenance gaps

Package F is `DOC-01-01`, `DOC-01-02`, `DOC-01-03`, `RET-01-01`, `RET-01-02`, and `RET-01-03`.

`activeClinicClinicalDocumentService.js` stores a title, body text, type, date, and draft or final status. The mapped row has no digest, page count, operator, quality status, or match confidence. The words quarantine, legal hold, page count, and sha256 are absent from that service.

`DOC-01-01` stays partial. `DOC-01-02` and `DOC-01-03` stay missing. An uncertain scan is not held, because there is no scan import. A missing page has no exception log.

No document row was written.
