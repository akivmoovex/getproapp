# ActiveClinic functionality

Product version 2.13.1. Statuses match `docs/qa/V13_G35_FINAL_REQUIREMENTS_MATRIX.md`. Nothing here is `VERIFIED_E2E`. The healthcare brief is `SOURCE_UNAVAILABLE`.

Shared fields for every row: tenant scope is `organization_id`; facility scope is the selected facility; latest execution evidence is database-free tests only; HTTP and browser evidence is `NOT_RUN`.

### AC-01 Organisation and facilities

FEATURE_ID AC-01. MODULE organisation. PURPOSE register a clinic and its facilities. ROLES organisation admin. UI `/app/select-organization`, `/app/select-facility`, `/app/onboarding`. WORKFLOW choose an organisation, then a facility. INPUTS organisation and facility ids. VALIDATION existing organisation and facility checks. ROUTES those select routes. SERVICES existing organisation and facility services. TABLES `platform.organizations`, `activeclinic.healthcare_organizations`, `activeclinic.facilities`. PERMISSIONS `activeclinic.access`. AUDIT existing admin audit. DEPENDENCIES platform identity. ERRORS invalid selection redirects back to the selector. SECURITY tenant predicate. TESTS existing organisation contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE a staff member works in one selected facility. LIMITATION HTTP not run. NEXT run the isolated auth suite.

### AC-02 Patient identity

PURPOSE warn on a possible duplicate without merging. ROLES registration staff. UI patient registration. WORKFLOW a strong match is a candidate and is not merged. INPUTS identity fields. VALIDATION existing duplicate review. SERVICES patient identity service. TABLES patients. PERMISSIONS patient registration permission. AUDIT match review. DEPENDENCIES AC-03. ERRORS conflict is returned, not merged. SECURITY `mergeActiveClinicPatients` stays `merge_deferred`. TESTS identity contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE two strong matches stay unmerged. LIMITATION no automatic merge. NEXT keep the deferred merge.

### AC-03 Patient registration

PURPOSE create a patient chart. ROLES registration staff. UI `/app/patients`. WORKFLOW post the registration form. INPUTS demographics required by the existing form. VALIDATION existing patient service. ROUTES `POST /app/patients`. SERVICES patient service. TABLES patients and contacts. PERMISSIONS patient create. AUDIT create event. DEPENDENCIES AC-01. ERRORS invalid input stays on the form. SECURITY organisation predicate. TESTS patient contracts and the G39 route contract. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE one organisation cannot read another organisation’s patient. NEXT isolated HTTP.

### AC-04 Demographics and contacts

PURPOSE store contact details on the chart. ROLES registration staff. UI patient form. WORKFLOW save with the registration or edit flow. INPUTS phone and address fields already on the form. VALIDATION existing parsers. SERVICES patient service. TABLES patient contact columns. PERMISSIONS patient edit. AUDIT update event. DEPENDENCIES AC-03. ERRORS invalid phone rejected by the existing parser. SECURITY tenant scope. TESTS patient contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE saved contacts stay on that patient. NEXT isolated HTTP.

### AC-05 Next of kin and alerts

PURPOSE store an emergency contact and clinical alerts. ROLES registration and clinical staff. UI patient chart. WORKFLOW save kin and alert fields. INPUTS kin name and alert text. VALIDATION existing required-field checks. SERVICES patient and alert services. TABLES emergency contacts and clinical alerts. PERMISSIONS patient and clinical view. AUDIT alert write. DEPENDENCIES AC-03. ERRORS missing required kin fields rejected. SECURITY alerts are not shown across organisations. TESTS existing alert contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE an alert is visible only inside the organisation. NEXT isolated HTTP.

### AC-06 Longitudinal record

PURPOSE show earlier encounters for one patient. ROLES clinician. UI clinical encounter and documents. WORKFLOW open the patient and prior encounters. INPUTS patient id. VALIDATION existing encounter list. SERVICES clinical service. TABLES encounters. PERMISSIONS encounter view. AUDIT view audit where already recorded. DEPENDENCIES AC-07. ERRORS unknown patient is not found. SECURITY facility and organisation filters. TESTS encounter contracts. STATUS `PARTIAL`. ACCEPTANCE prior encounters are listed. LIMITATION continuity is basic. No new longitudinal policy was added. NEXT leave the existing encounter list.

### AC-07 Visit lifecycle

PURPOSE open and close one encounter. ROLES clinician with manage permission. UI `/app/clinical/start-encounter` and the encounter page. WORKFLOW start, work, then close with a matching version. INPUTS patient, organisation, facility, actor, version. VALIDATION UUID scope is required before a query. SERVICES `startEncounter`, `closeEncounter`. TABLES encounters. PERMISSIONS encounter manage. AUDIT status change. DEPENDENCIES AC-03. ERRORS wrong version returns `STALE_VERSION`. SECURITY close updates only the matching open row. TESTS clinical contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE a second close does not rewrite a closed encounter. NEXT isolated HTTP.

### AC-08 Reception and queue

PURPOSE check in a scheduled visit or a walk-in. ROLES receptionist with check-in and queue permissions. UI `/app/reception`, `/app/reception/check-in`, `/app/reception/walk-in`. WORKFLOW pick a service point in the selected facility and create a queue entry. INPUTS patient and service point. VALIDATION another facility’s points stay out. SERVICES reception service. TABLES queue entries and service points. PERMISSIONS check-in and manage queue. AUDIT check-in. DEPENDENCIES AC-01. ERRORS empty facility explains that a point must be added. SECURITY public booking stays off. TESTS reception contracts and the route contract. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE the queue entry stays in that clinic. NEXT isolated browser AC-REC-02.

### AC-09 Nursing and triage

PURPOSE record triage and vitals. ROLES nurse with `activeclinic.triage.record`. UI Start triage and Record vitals. WORKFLOW open an encounter and post vitals. INPUTS stored vital types only. VALIDATION unknown vital types stay rejected. SERVICES clinical vitals. TABLES vitals. PERMISSIONS triage record. A receptionist does not have it. AUDIT vital write. DEPENDENCIES AC-07. ERRORS missing permission is denied. SECURITY no invented numeric threshold. TESTS triage contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE an unauthorized session cannot change the vital. NEXT isolated browser AC-REC-03.

### AC-10 Consultation

PURPOSE record a consultation note. ROLES clinician. UI encounter consultation. WORKFLOW write and sign. INPUTS note text. VALIDATION a signed note cannot be overwritten. SERVICES clinical note service. TABLES consultation notes. PERMISSIONS encounter manage. AUDIT sign event. DEPENDENCIES AC-07. ERRORS `cannot_edit_signed`. SECURITY the amendments table stays unused. TESTS note contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE a signed note is unchanged by a later save. NEXT isolated HTTP.

### AC-11 Diagnoses and plans

PURPOSE record the clinician’s diagnosis text and plan. ROLES clinician. UI `/app/clinical/encounter/:encounterId/diagnosis`. WORKFLOW post free text. INPUTS diagnosis text. VALIDATION existing length checks. SERVICES clinical service. TABLES diagnosis rows. PERMISSIONS encounter manage. AUDIT diagnosis write. DEPENDENCIES AC-10. ERRORS empty text rejected by the existing form. SECURITY no code is invented. TESTS diagnosis contracts. STATUS `PARTIAL`. ACCEPTANCE the text is stored on that encounter. LIMITATION no diagnosis catalogue. NEXT do not invent codes.

### AC-12 Prescriptions and referrals

PURPOSE record a manual prescription on the encounter. ROLES clinician. UI prescription order form. WORKFLOW enter drug name, dose, frequency, and duration. INPUTS those four fields. VALIDATION `prescriptionDosageInstructions` requires them. A queue insert needs a catalogue UUID and a whole number quantity. ROUTES `/app/clinical/encounter/:encounterId/order/:orderType`. SERVICES `activeClinicClinicalService`. TABLES clinical orders and pharmacy queue only when the catalogue id matches the organisation. PERMISSIONS clinical order. AUDIT order write. DEPENDENCIES AC-10. ERRORS missing dose fields rejected before a query. SECURITY the form says manual entry only. TESTS pharmacy unit and the G39 contract. STATUS `PARTIAL`. ACCEPTANCE a complete manual prescription is stored. LIMITATION it does not join the queue without a catalogue id. NEXT do not add a picker until that form rule changes.

### AC-13 Laboratory

PURPOSE order a test, queue it, and record a result. ROLES clinician to order; laboratory staff to work the queue. UI order form and `/app/diagnostics/laboratory/queue`. WORKFLOW choose urgency `routine`, `urgent`, or `stat`, add a reason, then the laboratory records a result. INPUTS test, urgency, reason. VALIDATION unknown urgency such as `high` is rejected. Empty urgency stays `routine`. SERVICES diagnostic fulfillment. TABLES orders, specimens, results. PERMISSIONS laboratory view for the queue. AUDIT order and result. DEPENDENCIES AC-10. ERRORS a missing request returns `REQUEST_NOT_FOUND` in the gated runner, which is `NOT_RUN`. SECURITY reference ranges are stored only when the caller supplies them. TESTS G03 unit and contract. STATUS `PARTIAL`. ACCEPTANCE the order stays on the encounter. LIMITATION no approved ranges or critical thresholds. Binary result files stay deferred. NEXT isolated G03 denial, not a new range table.

### AC-14 Pharmacy dispensing

PURPOSE dispense against a pharmacy prescription. ROLES pharmacist with `activeclinic.pharmacy.dispense`. UI `/app/pharmacy`. WORKFLOW load the prescription in the organisation and dispense a positive quantity from an available batch. INPUTS item, quantity, batch. VALIDATION quantity cannot exceed remaining. Expired or unavailable batches are rejected. SERVICES `dispensePrescription`. TABLES `pharmacy_prescriptions`, `dispense_events`, `dispense_items`. PERMISSIONS dispense. AUDIT dispense event. DEPENDENCIES AC-12 for the queue handoff. ERRORS unknown staff is `ACCESS_DENIED` in the gated runner, which is `NOT_RUN`. SECURITY no delete of a dispense event. TESTS G04 contracts and the remaining-quantity contract. STATUS `PARTIAL`. ACCEPTANCE a second quantity above the remainder is rejected. LIMITATION the clinical form does not hand off without a catalogue id. NEXT use the existing dispense service. Do not invent doses.

### AC-15 Billing

PURPOSE invoice, take a payment, and reverse it. ROLES billing staff. UI `/app/billing` and `/app/billing/reports/revenue`. WORKFLOW create an invoice in minor units and record a payment. INPUTS amount minor, currency already defaulted in existing code. VALIDATION duplicate submission and already reversed. SERVICES billing service. TABLES invoices, payments, receipts. PERMISSIONS billing permission. A receptionist denial is prepared and `NOT_RUN`. AUDIT payment and reversal. DEPENDENCIES AC-01. ERRORS `duplicate_submission`, `already_reversed`. SECURITY no card processor was added. TESTS billing contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE a reversed payment is not reversed twice. NEXT isolated billing denial.

### AC-16 Closeout

PURPOSE finish the encounter after the work is done. ROLES clinician with manage permission. UI encounter close action. WORKFLOW post close with the current version. INPUTS encounter, actor, organisation, facility, version. VALIDATION missing scope returns invalid input before a query. Zero rows return `STALE_VERSION`. SERVICES `closeEncounter`. TABLES encounters. PERMISSIONS encounter manage. AUDIT close. DEPENDENCIES AC-07. ERRORS stale version. SECURITY the update matches organisation, facility, open status, and version. TESTS close contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE the encounter is closed once. NEXT isolated HTTP.

### AC-17 Documents

PURPOSE index a text clinical document on a patient. ROLES clinician. UI `/app/clinical/patients/:patientId/documents`. WORKFLOW create, edit, and finalize text. INPUTS title and body. VALIDATION existing document service. SERVICES clinical document service. TABLES clinical documents. PERMISSIONS document permission. A receptionist denial is prepared and `NOT_RUN`. AUDIT finalize. DEPENDENCIES AC-03. ERRORS unknown patient is not found. SECURITY binary attachment columns stay unused. TESTS document contracts and the route contract. STATUS `PARTIAL`. ACCEPTANCE the text document is retrieved for that patient. LIMITATION no file bytes. NEXT keep text documents.

### AC-18 Scanning and migration

PURPOSE inventory a future import. ROLES not routed. UI none. WORKFLOW `openMigrationBatch` returns `access_denied` unless the caller passes `authorization.ok === true` and `authorization.permissionKey` of `activeclinic.clinical_document.create`. A granted call would insert after 043. INPUTS batch label, scope, and that authorization. VALIDATION bytes are refused. An unauthorized call does not query. SERVICES `activeClinicRecordMigrationService`. TABLES the four 043 tables, which are not applied. PERMISSIONS the document-create key is required by the service. No HTTP file calls it. AUDIT not routed. DEPENDENCIES migration 043. ERRORS `access_denied`, `binary_storage_deferred`. SECURITY no HTTP file imports the opener. TESTS migration unit tests, including the denied call, and the G39 unrouted contract. STATUS `BLOCKED` and `MIGRATION_PENDING`. ACCEPTANCE no real file is imported. LIMITATION 043 has not run and there is still no screen. NEXT apply 043 only on an authorized isolated database, then mount a route that passes the existing permission result.

### AC-19 Retention and consent

PURPOSE record consent and refuse unapproved destruction. ROLES records staff for consent. UI existing consent flow. WORKFLOW withdraw consent through the existing service. Holds would use 043. INPUTS consent choice. VALIDATION paper disposal ignores elapsed days. SERVICES `requestPaperDisposal`, `selectRetentionCategory`. TABLES consent tables now; `retention_holds` only after 043. PERMISSIONS existing consent permission. AUDIT consent change. DEPENDENCIES 043 for holds. ERRORS `legal_approval_required`. SECURITY `deleted` stays false. TESTS paper-disposal unit and the G39 contract. STATUS `PARTIAL`. ACCEPTANCE paper is retained. NEXT do not add age-based deletion.

### AC-20 Administration and reporting

PURPOSE show operational and revenue summaries that already exist. ROLES admin and billing. UI dashboard and `/app/billing/reports/revenue`. WORKFLOW open the report for the selected facility. INPUTS date range. VALIDATION existing report service. SERVICES billing ops and dashboard loaders. TABLES invoices and payments. PERMISSIONS billing and admin. AUDIT report view where already recorded. DEPENDENCIES AC-15. ERRORS missing facility redirects to facility select. SECURITY no new clinical narrative report was added. TESTS existing report contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE the revenue report stays inside the facility. LIMITATION it was not executed. NEXT an isolated report read, not a new metric.

### AC-21 Roles

PURPOSE give each department its permission keys. ROLES organisation admin assigning staff. UI staff and role screens. WORKFLOW assign a role with a valid scope. INPUTS role and scope. VALIDATION receptionist with organisation scope returns `invalid_scope`. SERVICES staff role service. TABLES staff members and role assignments. PERMISSIONS role admin. AUDIT role change. DEPENDENCIES AC-01. ERRORS OTP fail-closed when activation is active. SECURITY clinician does not receive triage.record by this assignment. TESTS role contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE a receptionist cannot open the practitioner worklist. NEXT isolated G13 denial.

### AC-22 Security and audit

PURPOSE protect sessions and record sensitive actions. ROLES every signed-in user. UI all app forms. WORKFLOW one CSRF token per page, checked on post. INPUTS session and token. VALIDATION mismatch is 403. SERVICES CSRF and audit helpers. TABLES audit tables. PERMISSIONS route permissions. AUDIT redacted audit. DEPENDENCIES platform session. ERRORS missing token is 403. SECURITY OTP stays fail-closed. TESTS CSRF contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE a second token is not issued over the first. NEXT isolated auth HTTP.

### AC-23 Tenant and facility isolation

PURPOSE keep clinic A out of clinic B. ROLES all clinical roles. UI every clinical write. WORKFLOW queries include organisation and facility. INPUTS those ids. VALIDATION missing scope fails before a query. SERVICES clinical, pharmacy, billing. TABLES all clinical tables with organisation id. PERMISSIONS the route permission plus the scope. AUDIT denied access. DEPENDENCIES AC-01. ERRORS 403 or not found. SECURITY cross-facility service points stay hidden. TESTS isolation contracts and prepared browser denials. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE a foreign encounter id does not close. NEXT isolated browser denials.

### AC-24 Configuration

PURPOSE keep public booking off unless a clinic explicitly enables it. ROLES organisation admin. UI booking settings. WORKFLOW the V13 fixture path forces `publicBookingEnabled: false`. INPUTS the flag. VALIDATION the public route refuses a clinic that is not enabled. SERVICES public booking routes. TABLES clinic settings. PERMISSIONS settings permission. AUDIT setting change. DEPENDENCIES AC-01. ERRORS the disabled page title remains “Booking not available”. SECURITY coupons stay absent. TESTS booking contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE the public page offers no coupon. NEXT leave booking disabled.

### AC-25 Export

PURPOSE export a tenant data job. ROLES platform or organisation admin, when authorized. UI existing data-job screen. WORKFLOW `runDataJobExport` exists and was not called. INPUTS job id and tenant. VALIDATION existing job service. SERVICES `dataJobService`. TABLES job tables. PERMISSIONS job permission. AUDIT job row. DEPENDENCIES an authorized database. ERRORS not executed. SECURITY no export file was written. TESTS job contracts. STATUS `BLOCKED` and `NOT_DEMONSTRATED`. ACCEPTANCE an export runs only on an isolated database. NEXT do not run it in this phase.

### AC-26 Downtime and recovery

PURPOSE show a non-writing offline page. ROLES any user who hits the route. UI `/app/offline`. WORKFLOW return 503. INPUTS none. VALIDATION the handler does not begin a transaction. SERVICES the app route. TABLES none. PERMISSIONS none beyond the page. AUDIT none. DEPENDENCIES no restore tool. ERRORS 503. SECURITY no sync engine. TESTS the G39 offline contract. STATUS `BLOCKED`. ACCEPTANCE the page does not write. LIMITATION recovery is not demonstrated. NEXT document the gap. Do not claim a restore.

### AC-27 Accessibility

PURPOSE keyboard and label access. ROLES all users. UI existing forms. WORKFLOW not audited. INPUTS n/a. VALIDATION existing labels were not rechecked in this phase. SERVICES n/a. TABLES n/a. PERMISSIONS n/a. AUDIT n/a. DEPENDENCIES an audit method. ERRORS n/a. SECURITY n/a. TESTS none for an audit. STATUS `BLOCKED` and `NOT_DEMONSTRATED`. ACCEPTANCE an audit with recorded findings. NEXT do not claim a pass.

### AC-28 Monitoring

PURPOSE operational monitoring. ROLES operations. UI none added. WORKFLOW none. INPUTS n/a. VALIDATION no monitor contract was present. SERVICES none new. TABLES none. PERMISSIONS n/a. AUDIT n/a. DEPENDENCIES an approved monitor contract. ERRORS n/a. SECURITY no new agent. TESTS none. STATUS `BLOCKED` and `NOT_DEMONSTRATED`. ACCEPTANCE a named check with a result. NEXT do not add a monitor without that contract.

### AC-29 Interoperability

PURPOSE national or insurance exchange. ROLES none. UI none. WORKFLOW none. INPUTS n/a. VALIDATION n/a. SERVICES none. TABLES none. PERMISSIONS n/a. AUDIT n/a. DEPENDENCIES an external agreement. ERRORS n/a. SECURITY no adapter. TESTS none. STATUS `DEFERRED`. ACCEPTANCE an approved adapter. NEXT leave it deferred.

### AC-30 Performance

PURPOSE capacity evidence. ROLES none. UI none. WORKFLOW no load test. INPUTS n/a. VALIDATION n/a. SERVICES n/a. TABLES n/a. PERMISSIONS n/a. AUDIT n/a. DEPENDENCIES an isolated load plan. ERRORS n/a. SECURITY n/a. TESTS none. STATUS `BLOCKED` and `NOT_DEMONSTRATED`. ACCEPTANCE a recorded load result. NEXT do not claim scale.

Totals: 16 `IMPLEMENTED_UNVERIFIED`, 7 `PARTIAL`, 6 `BLOCKED`, 1 `DEFERRED`.
