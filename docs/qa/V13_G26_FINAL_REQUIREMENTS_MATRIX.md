# V13 G26 — requirements matrix

Nothing in this matrix is `VERIFIED_COMPLETE`. `IMPLEMENTED_E2E_NOT_RUN` means the source and a database-free test exist and the user workflow was not executed.

## ActiveClinic

| ID | Class |
| --- | --- |
| AC-REG-01, AC-AUTH-04, AC-WEB-08, AC-WEB-09, AC-REC-02, AC-REC-03, AC-PUB-01 | IMPLEMENTED_E2E_NOT_RUN |
| AC-IDENTITY, AC-VISITS, AC-CONSULT, AC-AUDIT-CLINICAL | IMPLEMENTED_E2E_NOT_RUN |
| AC-LAB-ORDER, AC-LAB-QUEUE, AC-LAB-SPECIMEN, AC-LAB-ISOLATION | IMPLEMENTED_E2E_NOT_RUN |
| AC-RX-CATALOGUE, AC-RX-DISPENSE, AC-TARIFF, AC-INVOICE, AC-PAYMENT, AC-RECEIPT, AC-FINANCE-REPORT | IMPLEMENTED_E2E_NOT_RUN |
| AC-DOC-TEXT, AC-DOC-INDEX, AC-CONSENT, AC-DOC-AUDIT | IMPLEMENTED_E2E_NOT_RUN |
| AC-LAB-RESULT | PARTIAL. Caller-supplied flags only. No approved range catalogue |
| AC-RX-ORDER | PARTIAL. Queue needs a catalogue item and a whole-number quantity |
| AC-MATCH-REVIEW, AC-RETENTION | PARTIAL. Logic exists. Tables are not applied and there is no screen |
| AC-MIGRATION-BATCH | MIGRATION_PENDING |
| AC-PUB-ENABLED, AC-CDS, AC-DRUG-INTERACTION, AC-DIAGNOSIS-CODES, AC-BINARY-STORAGE, AC-PAPER-DISPOSAL, AC-RESULT-REVIEW, AC-STOCK-EXPANSION | DEFERRED |

Counts: 26 end-to-end-not-run, 4 partial, 1 migration pending, 0 missing, 8 deferred.

## BlessBoard

| ID | Class |
| --- | --- |
| BB-REG-07, BB-AUTH-04, BB-MEM-01, BB-MEM-02, BB-WEB-09, BB-WEB-10, BB-ANN-01 | IMPLEMENTED_E2E_NOT_RUN |
| BB-WEB-08 | PARTIAL. Public-page fixture rows absent |
| BB-ANN-02 | PARTIAL. Uploads stay disabled |

Counts: 7 end-to-end-not-run, 2 partial, 0 missing.

## Shared

Identity reuse, CSRF, session revocation, audit redaction, and appointment versions are `IMPLEMENTED_E2E_NOT_RUN`. Backup, restore, and offline mode are `BLOCKED` until a demonstration is authorized.
