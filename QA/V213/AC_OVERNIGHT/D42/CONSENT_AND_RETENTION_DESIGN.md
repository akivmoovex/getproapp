# Consent and retention design

Consent capture still rejects a forged organization id before a query. The mapped consent still has no representative, witness, or legal-hold field. Stored consent types are unchanged. D29-16 is pending, so no representative identity was added.

Retention and legal hold are not implemented. D21-09 is pending. No period, no deleter, and no hold column was chosen. A later batch needs a named period, the record classes it covers, who may place a hold, and who may dispose after the hold ends. Until that approval, documents and consents stay as stored.

Import quarantine is the same batch. The clinical document service has no quarantine state. Scans are not accepted as binary attachments in this service.
