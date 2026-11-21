# V2.13.1 G08 — requirements matrix

HEAD remains `97f31f0791d0493c23b24c8eb026f77102c47dd7` on `V13`. The healthcare brief PDF and both QA office documents are not on disk. Rows below are the requirements named by the regression reports and by G02–G07. An unread brief item is not counted as missing.

`PARTIAL` means the source and a database-free test exist. It is not a completed user workflow. HTTP and browser results are `NOT_RUN` for every row.

## ActiveClinic

| ID | Module | Status | Source | Data | UI | Safe test | Gap or decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-REG-01 | Registration | PARTIAL | `resolveRegistrationContactIdentity.js` | `platform.identities` | Registration form | PASS | HTTP occupancy not run |
| AC-AUTH-04 | Recovery | PARTIAL | `activeClinicPasswordRecoveryService.js` | Recovery token | Reset page | PASS | Reset HTTP not run |
| AC-WEB-08 | Website | PARTIAL | `activeClinicWebsiteCmsRoutes.js` | `platform.website_content` | Section editor | PASS | Publish HTTP not run |
| AC-WEB-09 | Themes | PARTIAL | `websiteThemeService.js` | Theme draft | Theme gallery | PASS | Browser apply not run |
| AC-REC-02 | Reception | PARTIAL | `activeClinicReceptionService.js` | `service_points` | Walk-in screen | PASS | Check-in HTTP not run |
| AC-REC-03 | Nursing | PARTIAL | `activeClinicClinicalService.js` | Vitals tables | Queue and vitals | PASS | Nurse HTTP not run |
| AC-PUB-01 | Booking | PARTIAL | `activeClinicPublicBookingRoutes.js` | `public_booking_enabled` default false | Disabled page | PASS | Disabled-page HTTP not run |
| AC-IDENTITY | Patients | PARTIAL | `activeClinicPatientService.js` | `patients` | Patient screens | PASS | No automatic merge |
| AC-VISITS | Encounters | PARTIAL | `activeClinicClinicalService.js` | `encounters` | Encounter screens | PASS | HTTP not run |
| AC-CONSULT | Consultation | PARTIAL | `activeClinicClinicalService.js` | `consultation_notes` | Workspace | PASS | Signed notes stay immutable |
| AC-AUDIT-CLINICAL | Audit | PARTIAL | `auditEventService.js` | Encounter events | — | PASS | HTTP not run |
| AC-LAB-ORDER | Laboratory | PARTIAL | `activeClinicClinicalService.js` | `laboratory_requests` | Lab request form | PASS | Priority stored; HTTP not run |
| AC-LAB-QUEUE | Laboratory | PARTIAL | `loadActiveClinicDiagnosticsScreens.js` | Request status | Lab queue | PASS | HTTP not run |
| AC-LAB-SPECIMEN | Laboratory | PARTIAL | `activeClinicDiagnosticsService.js` | `specimens` | Collect screen | PASS | HTTP not run |
| AC-LAB-RESULT | Laboratory | PARTIAL | `activeClinicDiagnosticsService.js` | Result components | Result entry | PASS | No invented reference range |
| AC-LAB-ISOLATION | Laboratory | PARTIAL | Diagnostics routes | Organization id | Queue | PASS | Browser denial not run |
| AC-RX-CATALOGUE | Pharmacy | PARTIAL | `activeClinicPharmacyService.js` | `medication_catalogue_items` | Catalogue | PASS | No new prices |
| AC-RX-ORDER | Pharmacy | PARTIAL | `activeClinicClinicalService.js` | `pharmacy_prescriptions` | Prescription form | PASS | Queue needs a catalogue item |
| AC-RX-DISPENSE | Pharmacy | PARTIAL | `activeClinicPharmacyService.js` | Dispense events | Dispense screen | PASS | HTTP not run |
| AC-TARIFF | Billing | PARTIAL | `activeClinicBillingService.js` | `charge_catalogue_items` | Catalogue | PASS | No new tariff values |
| AC-INVOICE | Billing | PARTIAL | `activeClinicBillingService.js` | `invoices` | Invoice screens | PASS | HTTP not run |
| AC-PAYMENT | Billing | PARTIAL | `activeClinicBillingService.js` | `payments` minor units | Payment screen | PASS | No payment processor |
| AC-RECEIPT | Billing | PARTIAL | `activeClinicBillingService.js` | `receipts` | Receipt screen | PASS | HTTP not run |
| AC-FINANCE-REPORT | Billing | PARTIAL | `activeClinicBillingOpsService.js` | Invoice totals | Report screen | PASS | HTTP not run |
| AC-DOC-TEXT | Records | PARTIAL | `activeClinicClinicalDocumentService.js` | `clinical_documents` | Document screens | PASS | Text only |
| AC-DOC-INDEX | Records | PARTIAL | `041_clinical_documents.sql` | Patient and facility indexes | Document list | PASS | HTTP not run |
| AC-MIGRATION-BATCH | Records | PARTIAL | `043_record_migration_inventory.sql` | New tables | None | PASS | Migration not applied |
| AC-MATCH-REVIEW | Records | PARTIAL | `activeClinicRecordMigrationService.js` | Match status | None | PASS | No automatic merge |
| AC-RETENTION | Records | PARTIAL | `043_record_migration_inventory.sql` | Holds and categories | None | PASS | No elapsed-time deletion |
| AC-CONSENT | Records | PARTIAL | `activeClinicPatientConsentService.js` | `patient_consents` | Consent screens | PASS | HTTP not run |
| AC-DOC-AUDIT | Records | PARTIAL | `clinical_document_events` | Event rows | — | PASS | Export audit not run |

## ActiveClinic deferred

| ID | Status | Decision still required |
| --- | --- | --- |
| AC-PUB-ENABLED | DEFERRED | Enabled booking and coupons |
| AC-CDS | DEFERRED | Clinical decision support |
| AC-DRUG-INTERACTION | DEFERRED | Drug-interaction checking |
| AC-DIAGNOSIS-CODES | DEFERRED | Structured diagnosis catalogue |
| AC-BINARY-STORAGE | DEFERRED | Clinical file storage and a size limit |
| AC-PAPER-DISPOSAL | DEFERRED | Legal approval for paper destruction |
| AC-RESULT-REVIEW | DEFERRED | Non-critical result review status |
| AC-STOCK-EXPANSION | DEFERRED | Further stock-management scope |

## BlessBoard

| ID | Module | Status | Source | Safe test | Gap |
| --- | --- | --- | --- | --- | --- |
| BB-REG-07 | Registration | PARTIAL | `platformChurchRegistrationService.js` | PASS | HTTP not run |
| BB-AUTH-04 | Recovery | PARTIAL | `blessBoardOtpService.js` | PASS | Production provider stays closed |
| BB-MEM-01 | Members | PARTIAL | `blessBoardStaffAddMemberFormService.js` | PASS | HTTP not run |
| BB-MEM-02 | Members | PARTIAL | `hqMembersAdminRoutes.js` | PASS | CSRF HTTP not run |
| BB-WEB-08 | Website | PARTIAL | `websiteThemeService.js` | PASS | Public-page fixture rows absent |
| BB-WEB-09 | Sermons | PARTIAL | `websiteStructuredDraftService.js` | PASS | Browser not run |
| BB-WEB-10 | Events | PARTIAL | `websiteStructuredDraftService.js` | PASS | Browser not run |
| BB-ANN-01 | Announcements | PARTIAL | `announcementsRepository.js` | PASS | Public HTTP not run |
| BB-ANN-02 | Media | PARTIAL | `mediaUploadsEnabled.js` | PASS | Uploads stay disabled |

## Shared platform

Seven areas have source and a safe test: user lifecycle, roles, tenant configuration, audit redaction, reporting jobs, data export jobs, and the security checks for identity reuse, CSRF, session revocation, and appointment `stale_version`. None of those workflows was executed over HTTP. Backup, restore, and offline mode were not demonstrated. `src/platform/ops/restoreTenant.js` is absent.

```
AC_REQUIREMENTS_TOTAL=39
AC_IMPLEMENTED=0
AC_PARTIAL=31
AC_MISSING=0
AC_DEFERRED=8
BB_REQUIREMENTS_TOTAL=9
BB_IMPLEMENTED=0
BB_PARTIAL=9
BB_MISSING=0
SHARED_REQUIREMENTS_IMPLEMENTED=0
```
