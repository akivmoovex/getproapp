# ActiveClinic Feature Catalog

**Mode:** READ-ONLY catalog synthesis (no application code changes).  
**Date:** 2026-10-02  
**Product:** ActiveClinic  
**Authority:** Existing Cursor-generated audits/specs first; deferred ideas are IMPLEMENTED=NO (not claimed as shipped).  
**Comparison:** Not compared to other products in this document.

## Sources
- `docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md`
- `docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md`
- `docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md`
- `docs/releases/V2_03_RELEASE_NOTES.md`
- `docs/releases/V2_04_RELEASE_NOTES.md`
- `docs/product/V2_04_PRODUCT_DECISION_REGISTER.md`
- `docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md`
- `docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md (AC-WEB-EDITOR-01)`

## Record schema

Each feature: FEATURE_ID · FEATURE_NAME · MODULE · PRODUCT · USER_BEHAVIOR · IMPLEMENTED · PRIMARY_ROUTE_OR_AREA · AUTOMATED_TEST · SOURCE_DOC · NOTES

**Totals:** FEATURES=99 · FULL(YES)=85 · PARTIAL=6 · NOT_IMPLEMENTED=8 · AUTOMATED_TESTED(YES)=82

## Registration / Authentication

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-REG-01 | Clinic self-registration wizard | Register clinic via multi-step form (clinic → admin → review) | YES | /register-clinic | YES | docs/releases/V2_04_RELEASE_NOTES.md | REG-STATE-01 closed; shared draft hydrate |
| AC-REG-02 | Registration country + city location | Select country; city autocomplete during registration | YES | /register-clinic | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | Shared geography |
| AC-REG-03 | Administrator password with live rules | Set admin password; live requirement indicators | YES | /register-clinic?step=administrator | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md | PLATFORM-PASSWORD-UX-01; shared rules |
| AC-REG-04 | Instant clinic provisioning after registration | Workspace + admin created; site unpublished until publish | YES | /register-clinic/success | YES | docs/releases/V2_04_RELEASE_NOTES.md | AC post-reg flows |
| AC-REG-05 | Staff login to clinic app | Authenticate into /app staff shell | YES | /login · /app | YES | docs/releases/V2_03_RELEASE_NOTES.md | Staff session |
| AC-REG-06 | Patient portal login | Patient signs in to clinic patient portal | YES | /clinics/:clinicKey/patient/login | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-P01 |
| AC-REG-07 | Patient registration / activation | Activate or link patient portal identity | YES | /clinics/:clinicKey/patient/register | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-P02 |

## Clinic Setup

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-SETUP-01 | Clinic setup checklist | See setup progress / next clinic configuration steps | YES | /app · settings clinic-setup | YES | docs/releases/V2_03_RELEASE_NOTES.md | Batch 1 |
| AC-SETUP-02 | Organization profile settings | View/edit healthcare organization profile | YES | /app/settings/organization | YES | docs/releases/V2_03_RELEASE_NOTES.md | Settings |
| AC-SETUP-03 | Regional / locale settings | Configure regional settings for clinic | YES | /app/settings (regional) | PARTIAL | docs/releases/V2_03_RELEASE_NOTES.md | Batch settings surfaces |
| AC-SETUP-04 | Post-registration website next-step CTA | Success page offers Edit Website → canonical editor | YES | /register-clinic/success | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md | AC-REG-WEB-01 |

## Website / Website Editor

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-WEB-01 | Website Management Hub | Manage status, unpublished count, tiles, Sections/Media/History; no fake editor canvas | YES | /app/settings/website | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md (AC-WEB-EDITOR-01) | AC-WEB-EDITOR-01 CLOSED; management-only |
| AC-WEB-02 | Enter visual edit mode | Open clinic site with pencils + WE01 chrome | YES | /clinics/:key?website_edit=1&website_mode=draft | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-03 | Draft preview mode | Preview unpublished draft without pencils | YES | /clinics/:key?website_mode=draft | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-04 | Inline text edit | Pencil → edit text → Save draft | YES | public edit + drafts API | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-05 | Inline image edit | Upload/library/remove/frame image → Save draft | YES | public edit + media | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-06 | FAQ / collection editor | Add/reorder/remove collection items on canvas | YES | website-collection-editor | PARTIAL | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-07 | Page selector in editor | Switch pages while staying in edit mode | YES | editor page rail | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-08 | Device viewport toggles | Desktop/Tablet/Mobile canvas width preview | YES | editor toolbar viewport | PARTIAL | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md | CSS simulation only; no UA emulation |
| AC-WEB-09 | Save draft (never auto-publishes) | Field Save posts draft only | YES | POST …/website/drafts | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-10 | Discard all draft changes | Discard all drafts; live unchanged | YES | POST …/drafts/discard | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-11 | Revert single field to published | Revert one content key to published value | YES | Change Manager | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-12 | Unpublished changes panel | See grouped diffs; preview/publish/revert | YES | unpublished-changes panel | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-13 | Publish website | Confirm → promote draft live | YES | POST …/website/publish | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-14 | Unpublish website | Take site offline; content preserved | YES | POST …/website/unpublish | PARTIAL | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-15 | Submit for approval | Submit draft when publish policy requires review | PARTIAL | POST …/website/submit | PARTIAL | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md | Policy-gated |
| AC-WEB-16 | Section actions (hide/reorder/add) | Edit section visibility/order; add section to draft | YES | section-actions / add-section | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-17 | Hub Sections / Pages CMS | Manage sections and pages from hub routes | YES | /app/settings/website/sections · /pages | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-18 | Media library | Upload/reuse website photos | YES | /app/settings/website/media | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-19 | Version history list + preview | Browse versions; preview historical snapshot | YES | …/website/versions | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-20 | Restore version as new draft | Restore creates draft only; live unchanged until publish | YES | POST …/versions/:id/restore | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-21 | Field history restore | Restore individual field into draft | YES | field-history routes | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-22 | Public catalogue (doctors/services) | Choose which doctors/services appear publicly | YES | /app/settings/website/catalogue | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-23 | Navigation / branding / SEO / chrome CMS | Manage menu, branding, SEO, header/footer from hub | YES | /app/settings/website/{navigation,branding,seo,chrome} | PARTIAL | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-24 | Content library | Reuse website copy/photos/placements | YES | /app/settings/website/library | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-25 | Public Stitch clinic website (R01–R12) | Public clinic site experiences (home, about, services, doctors, etc.) | YES | /clinics/:clinicKey/* | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | AC-MW-PUBLIC |
| AC-WEB-26 | Mobile editor UX | Bottom nav, sheet field editor, keyboard inset | YES | WE01 mobile chrome | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-27 | Website authz / tenant isolation | Cross-tenant edit denied; permission gates; CSRF | YES | website routes | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-WEB-28 | In-editor Layers panel (z-order) | Visual z-order layers tree in editor | NO | — | NO | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md | Hub 'Layers' = Sections CMS alias only |
| AC-WEB-29 | True device/UA emulation | Real device chrome / UA emulation | NO | — | NO | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md | Viewport CSS only |
| AC-WEB-30 | Delete media from library cards | Delete asset from library UI cards | NO | — | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md | Negative: delete not exposed by default |
| AC-WEB-31 | Initial unpublished changes = 0 | Fresh provision shows 0 unpublished without edits | YES | Change Manager baseline | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md | AC-INITIAL-DIRTY-STATE-01 |

## Services

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-SVC-01 | Services catalogue | List and manage clinic appointment service types | YES | /app/settings or services catalogue | YES | docs/releases/V2_03_RELEASE_NOTES.md | Batch 1 |
| AC-SVC-02 | Service editor | Create/edit service definitions and public visibility | YES | services editor | YES | docs/releases/V2_03_RELEASE_NOTES.md |  |
| AC-SVC-03 | Public service listings on website | Published services appear on public clinic site | YES | public services + catalogue | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |

## Practitioners / Staff

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-STAFF-01 | Practitioners catalogue | Manage practitioners and availability | YES | practitioners / staff admin | YES | docs/releases/V2_03_RELEASE_NOTES.md | Batch 1 |
| AC-STAFF-02 | Staff member administration | Create/manage staff members | YES | /app staff admin | YES | docs/releases/V2_03_RELEASE_NOTES.md | Batch 2 shell |
| AC-STAFF-03 | Public doctor profiles on website | Show selected practitioners on public site | YES | catalogue + public doctors | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| AC-STAFF-04 | Staff dashboard shell | Use clinic staff nav shell (desktop/mobile) | YES | /app | YES | docs/releases/V2_03_RELEASE_NOTES.md | Batch 2 |

## Appointments / Booking

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-APT-01 | Appointment calendar | View/create appointments on calendar | YES | /app appointments | YES | docs/releases/V2_03_RELEASE_NOTES.md | Batch 1 |
| AC-APT-02 | Appointment lifecycle | Manage appointment status lifecycle | YES | appointments services | YES | docs/releases/V2_03_RELEASE_NOTES.md |  |
| AC-APT-03 | Booking-request triage | Triage inbound booking requests | YES | booking request queue | YES | docs/releases/V2_03_RELEASE_NOTES.md |  |
| AC-APT-04 | Public booking entry (chrome) | Public site booking entry hands off to booking engine | PARTIAL | public book / Stitch R08 | PARTIAL | docs/product/V2_04_PRODUCT_DECISION_REGISTER.md | PD: chrome/handoff; engine inherited |
| AC-APT-05 | Patient portal my bookings | Patient lists own bookings | YES | /patient/bookings | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-P03 |
| AC-APT-06 | Patient booking detail / reschedule / cancel | View detail; cancel/reschedule owned booking | YES | /patient/bookings/:ref | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-P04 |

## Patients

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-PAT-01 | Patient directory | Search/list patients in org | YES | /app/patients | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | ACN10 |
| AC-PAT-02 | Add patient (staff intake) | Multi-step staff-managed patient create | YES | /app/patients/new | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-PT02–07; domain foundation |
| AC-PAT-03 | Duplicate patient detection | Warn on likely duplicates; no auto-merge | YES | create flow + duplicate engine | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-PD-04; merge deferred |
| AC-PAT-04 | Patient profile & consent ledger | View profile; manage clinical consents (staff) | YES | /app/patients/:n | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | ACN11 |
| AC-PAT-05 | Edit patient demographics | Edit demographics/contact/NOK | YES | /app/patients/:n/edit | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | ACN-P01 |
| AC-PAT-06 | Patient clinical history leaf | View aggregate encounter history list | YES | /app/patients/:n/clinical-history | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | ACN-P02 |
| AC-PAT-07 | Patient activity / audit timeline | View patient-scoped audit activity | YES | /app/patients/:n/activity | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | ACN-P04; AC-PD-01 |
| AC-PAT-08 | Patient documents (staff) | Manage ordinary clinical documents (MVP; no DICOM) | PARTIAL | /app/clinical/patients/:id/documents | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | ACN18/ACN-P03; binaries deferred |
| AC-PAT-09 | Full patient record merge | Destructively merge duplicate patients | NO | — | NO | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | DEFERRED AC-PD-04 |

## Clinical

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-CLIN-01 | Reception check-in | Check in patients / walk-ins | YES | /app/reception/check-in | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | ACN12 |
| AC-CLIN-02 | Live queue / triage | Manage reception live queue | YES | /app/reception | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | ACN13 |
| AC-CLIN-03 | Practitioner worklist | See clinical worklist | YES | /app/clinical | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | ACN14 |
| AC-CLIN-04 | Clinical encounter workspace | Document encounter notes/orders | YES | /app/clinical/encounter/:id | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | ACN15 |
| AC-CLIN-05 | Vitals recording | Record encounter vitals | YES | /app/clinical/encounter/:id/vitals | YES | docs/releases/V2_03_RELEASE_NOTES.md | ACN17 |
| AC-CLIN-06 | Follow-up / recall | Manage clinical follow-ups | YES | /app/clinical/follow-up | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | ACN16 |
| AC-CLIN-07 | Referrals worklist (staff) | Manage referrals | YES | /app/clinical/referrals | YES | docs/releases/V2_03_RELEASE_NOTES.md | ACN20 |
| AC-CLIN-08 | Visit summary release | Clinician releases patient-safe visit summary (no PDF) | PARTIAL | visit summary release | YES | docs/releases/V2_03_RELEASE_NOTES.md | MVP; PDF deferred |
| AC-CLIN-09 | Clinical notes isolation from reception | Reception cannot access clinical note bodies | YES | clinical RBAC | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md | AC-SEC-02 |

## Pharmacy

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-PHARM-01 | Pharmacy queue | Process pharmacy queue / prescriptions | YES | pharmacy queue routes | YES | docs/releases/V2_03_RELEASE_NOTES.md | Batch 2 |
| AC-PHARM-02 | Prescription orders (staff) | Order prescriptions from encounter | YES | encounter + pharmacy | YES | docs/releases/V2_03_RELEASE_NOTES.md | ACN19 |
| AC-PHARM-03 | Patient portal prescriptions (read-only) | Patient views own prescriptions | YES | /patient/prescriptions | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-P10 |

## Diagnostics

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-DIAG-01 | Diagnostics queues | Lab/radiology request queues | YES | diagnostics queue routes | YES | docs/releases/V2_03_RELEASE_NOTES.md | Batch 2; no full radiology suite |
| AC-DIAG-02 | Patient portal documents & results | Patient sees released lab/radiology only | YES | /patient/documents | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-P12 |
| AC-DIAG-03 | Dedicated radiology suite product | Full radiology suite product capability | NO | — | NO | docs/releases/V2_03_RELEASE_NOTES.md | Known limitation |

## Billing

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-BILL-01 | Invoices (staff) | Create/manage invoices | YES | billing / invoices | YES | docs/releases/V2_03_RELEASE_NOTES.md | Batch 1 |
| AC-BILL-02 | Cashier payments / receipts | Take payments; issue receipts | YES | cashier flows | YES | docs/releases/V2_03_RELEASE_NOTES.md |  |
| AC-BILL-03 | Patient portal invoices list | Patient views own invoices | YES | /patient/invoices | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-P06 |
| AC-BILL-04 | Patient invoice / receipt detail | Patient views invoice detail + receipts | YES | /patient/invoices/:id | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-P13 |
| AC-BILL-05 | Live Medicare claim submission | Automated Medicare ECLIPSE/API submission | NO | — | NO | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-PD-03 deferred |

## Facilities

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-FAC-01 | Facilities administration | Administer facilities | YES | /app facilities | YES | docs/releases/V2_03_RELEASE_NOTES.md | Batch 2 |
| AC-FAC-02 | Departments administration | Manage departments at facilities | YES | clinic-setup/departments | YES | docs/releases/V2_03_RELEASE_NOTES.md |  |
| AC-FAC-03 | Rooms & Spaces catalogue (MVP) | Inventory rooms/spaces (no occupancy engine) | PARTIAL | Rooms & Spaces | YES | docs/releases/V2_03_RELEASE_NOTES.md | MVP inventory only |
| AC-FAC-04 | Facility-scoped public websites | Per-facility public websites | NO | — | NO | docs/releases/V2_03_RELEASE_NOTES.md | Not supported |

## Access / RBAC

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-RBAC-01 | Permission-gated clinic navigation | Nav/actions respect RBAC catalogue | YES | /app shell + catalogue | YES | docs/releases/V2_03_RELEASE_NOTES.md | Batch 2 RBAC audit |
| AC-RBAC-02 | Facility-scoped operational workflows | Ops scoped to selected facility | YES | facility context | YES | docs/releases/V2_03_RELEASE_NOTES.md |  |
| AC-RBAC-03 | Patient communication preferences (portal) | Patient manages communication preferences (not clinical consent) | YES | /patient/notifications | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-SEC-01 CLOSED |
| AC-RBAC-04 | Tier-2 clinical clearance architecture | Step-up clinical clearance product architecture | NO | — | NO | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-PD-05 deferred |

## Patient Portal

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-PORTAL-01 | Patient profile view/edit | View/update demographics contact fields | YES | /patient/profile | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-P07/P08 |
| AC-PORTAL-02 | Approved visit summaries | View released visit summaries only | YES | /patient/visit-summaries | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-P05 |
| AC-PORTAL-03 | Patient referrals (read-only) | View own referrals | YES | /patient/referrals | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-P11 |
| AC-PORTAL-04 | Security / access states | Password/security/offline/data-boundary states | PARTIAL | /patient/security etc. | PARTIAL | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-P14 |
| AC-PORTAL-05 | Patient portal session isolation | Portal session isolated from staff /app | YES | patient portal auth | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md |  |

## Reporting / Admin

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| AC-RPT-01 | Performance summaries | View operational performance summaries | YES | performance summaries | PARTIAL | docs/releases/V2_03_RELEASE_NOTES.md | Batch 1 |
| AC-RPT-02 | Import/export data jobs | Run import/export data jobs | YES | data jobs | PARTIAL | docs/releases/V2_03_RELEASE_NOTES.md | Batch 1 |

## Footer

PRODUCT=ActiveClinic
FEATURE_COUNT=99
FULL=85
PARTIAL=6
NOT_IMPLEMENTED=8
AUTOMATED_TESTED=82
