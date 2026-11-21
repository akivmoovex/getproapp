# V2.13.1 G05 — clinical records and document migration

Digitisation does not authorize destruction of paper records. This phase does not delete documents, does not connect to an external store, and does not claim HPCZ or other legal certification.

## What was added

`db/migrations/activeclinic/043_record_migration_inventory.sql` is prepared and was not executed. It adds migration batches, source-file inventory, caller-approved retention categories, and retention holds. The file contains no `DELETE`. A placed hold does not become a disposal approval when it is released.

`activeClinicRecordMigrationService.js` refuses file bytes with `binary_storage_deferred`. An uncertain or multiple patient match stays `review_required` and is not merged. A single strong match is only a candidate. `requestPaperDisposal` returns `legal_approval_required` with `deleted: false` even when a caller passes a large elapsed time. Retention categories are accepted only from a list the caller already approved.

## What was already present

Clinical documents in `041_clinical_documents.sql` are text records linked to a patient and facility. Final documents stay immutable. Indexes cover patient, facility, and date. Retrieval uses `activeclinic.clinical_document.view`. The existing contracts still forbid quarantine, a legal-hold flag, a page count, and a content hash on that service, so those were not added there. Binary attachments remain deferred.

Consent capture and withdrawal stay in `activeClinicPatientConsentService.js`. Withdrawal updates a granted row for the same patient and does not delete the ledger.

Document create, update, and finalize events remain on `clinical_document_events`.

## Not done

No approved clinical file-type allow-list or maximum size exists, so a declared size is only checked as a positive integer. No file was stored. The new tables are not in the isolated database. HTTP and browser checks were not run.

```
FINAL=V2131_G05
DOCUMENT_STORAGE=METADATA_ONLY_BYTES_DEFERRED
DOCUMENT_INDEXING=EXISTING_TEXT_INDEX_PLUS_UNAPPLIED_MIGRATION
MIGRATION_BATCHES=PREPARED_NOT_APPLIED
PATIENT_MATCH_REVIEW=PRESENT_NO_MERGE
RETENTION_CONTROLS=PREPARED_NO_DELETION
CONSENT=PRESENT
AUDIT_TRAIL=PRESENT_FOR_CLINICAL_DOCUMENTS
SAFE_TESTS_PASSED=459
SAFE_TESTS_FAILED=0
MIGRATIONS_PREPARED=1
LEGAL_APPROVAL_REQUIRED=YES
BLOCKERS=Healthcare brief absent; binary storage deferred; no approved file-size or media-type limit; migration 043 not applied; HTTP and browser NOT_RUN; no legal certification; G06 prompt was not in this request
```
