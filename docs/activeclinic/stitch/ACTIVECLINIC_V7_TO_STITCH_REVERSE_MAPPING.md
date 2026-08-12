# ActiveClinic V7 → Stitch Reverse Mapping

**Generated:** 2026-08-12T00:11:06.243Z

| Stat | Count |
|------|------:|
| Implementation records | 187 |
| With ≥1 Stitch mapping | 153 |
| Implemented without Stitch | 34 |

## Many-to-one examples (highest Stitch fan-in)

### ACV7-IMPL-0043 (19)

`/clinics/:clinicKey/book/procedures/:procedureKey` → views/activeclinic/booking/procedure-entry.ejs [DEFAULT]

- P25 - Juflona Booking - Preparation States - Mobile
- P25 - Juflona Booking - Procedure Confirmation Rules - Desktop
- P25 - Juflona Booking - Procedure Form States - Mobile
- P25 - Juflona Booking - Procedure Information - Desktop
- P25 - Juflona Booking - Procedure Information - Mobile
- P25 - Juflona Booking - Procedure Mobile Summary Pattern - Mobile
- P25 - Juflona Booking - Procedure Patient Details - Desktop
- P25 - Juflona Booking - Procedure Patient Details - Mobile
- P25 - Juflona Booking - Procedure Progress Patterns - Desktop
- P25 - Juflona Booking - Procedure Review - Desktop
- P25 - Juflona Booking - Procedure Review - Mobile
- P25 - Juflona Booking - Procedure Slot - Desktop
- P25 - Juflona Booking - Procedure Slot - Mobile
- P25 - Juflona Booking - Procedure SMS States - Mobile
- P25 - Juflona Booking - Referral and Upload States - Mobile
- P25 - Juflona Booking - Referral Clarification - Mobile
- P25 - Juflona Booking - Referral Requirements - Desktop
- P25 - Juflona Booking - Referral Requirements - Mobile
- P25 - Juflona Booking - Resource Availability States - Mobile

### ACV7-IMPL-0049 (19)

`/clinics/:clinicKey/my-booking` → views/activeclinic/booking/my-booking-detail.ejs [POPULATED]

- P26 - Juflona Booking - Booking Activity Pattern - Desktop
- P26 - Juflona Booking - Booking Changed During Request - Mobile
- P26 - Juflona Booking - Booking Detail Cancelled - Desktop
- P26 - Juflona Booking - Booking Detail Cancelled - Mobile
- P26 - Juflona Booking - Booking Detail Completed - Desktop
- P26 - Juflona Booking - Booking Detail Completed - Mobile
- P26 - Juflona Booking - Booking Detail Confirmed - Desktop
- P26 - Juflona Booking - Booking Detail Confirmed - Mobile
- P26 - Juflona Booking - Booking Detail No-show - Desktop
- P26 - Juflona Booking - Booking Detail No-show - Mobile
- P26 - Juflona Booking - Booking Detail Pending - Desktop
- P26 - Juflona Booking - Booking Detail Pending - Mobile
- P26 - Juflona Booking - Booking Detail Rescheduled - Desktop
- P26 - Juflona Booking - Booking Detail Rescheduled - Mobile
- P26 - Juflona Booking - Booking Status Patterns - Desktop
- P26 - Juflona Booking - Change Request States - Mobile
- P26 - Juflona Booking - Mobile Booking Summary Pattern - Mobile
- P26 - Juflona Booking - Pending Preference Change - Mobile
- P26 - Juflona Booking - Privacy and Lookup Rules - Desktop

### ACV7-IMPL-0030 (11)

`/clinics/:clinicKey/book` → views/activeclinic/booking/consultation-type.ejs [DEFAULT]

- P22 - Demo Clinic - Booking Entry - Desktop
- P22 - Demo Clinic - Booking Entry - Mobile
- P22 - Juflona Clinic - Booking Entry - Desktop
- P22 - Juflona Clinic - Booking Entry - Mobile
- P24 - Juflona Booking - Availability States - Mobile
- P24 - Juflona Booking - Consultation Type - Desktop
- P24 - Juflona Booking - Consultation Type - Mobile
- P24 - Juflona Booking - Form States - Mobile
- P24 - Juflona Booking - Mobile Navigation and Summary Pattern - Mobile
- P24 - Juflona Booking - Progress Patterns - Desktop
- P24 - Juflona Booking - SMS Notification States - Mobile

### ACV7-IMPL-0158 (11)

`/app/cashier/session` → views/activeclinic/app/cashier-session-content.ejs [DEFAULT]

- P07 – Cashier Shift – Desktop
- P07 – Cashier Shift – Mobile
- P07 – Open Cashier Shift – Desktop
- P07 – Payment Reversal Request
- P07 – Payment Reversal Review – Desktop
- P07 – Refund Approval – Desktop
- P07 – Refund Completed – Desktop
- P07 – Refund Rejected
- P07 – Refund Request – Desktop
- P07 – Refund Request – Mobile
- P07 – Refund Review – Desktop

### ACV7-IMPL-0160 (11)

`/app/cashier/payment` → views/activeclinic/app/cashier-payment-content.ejs [DEFAULT]

- P07 – Bank Transfer Payment – Mobile
- P07 – Card Payment – Desktop
- P07 – Cash Payment – Desktop
- P07 – Cash Payment – Mobile
- P07 – Deposit Payment – Desktop
- P07 – Mobile Money Payment – Desktop
- P07 – Mobile Money Payment – Mobile
- P07 – Payment Review – Desktop
- P07 – Record Payment – Desktop
- P07 – Record Payment – Mobile
- P07 – Split Payment – Desktop

### ACV7-IMPL-0047 (10)

`/clinics/:clinicKey/my-booking` → views/activeclinic/booking/my-booking-lookup.ejs [DEFAULT]

- P26 - Juflona Booking - Booking Activity Pattern - Desktop
- P26 - Juflona Booking - Booking Changed During Request - Mobile
- P26 - Juflona Booking - Booking Status Patterns - Desktop
- P26 - Juflona Booking - Change Request States - Mobile
- P26 - Juflona Booking - Lookup Progress - Mobile
- P26 - Juflona Booking - Mobile Booking Summary Pattern - Mobile
- P26 - Juflona Booking - My Booking - Desktop
- P26 - Juflona Booking - My Booking - Mobile
- P26 - Juflona Booking - Pending Preference Change - Mobile
- P26 - Juflona Booking - Privacy and Lookup Rules - Desktop

### ACV7-IMPL-0093 (8)

`/app/patients/new` → views/activeclinic/app/patient-form-content.ejs [DEFAULT]

- P02 – Duplicate Patient Warning
- P02 – Register Patient Contact – Desktop
- P02 – Register Patient Contact – Mobile
- P02 – Register Patient Emergency and Medical – Desktop
- P02 – Register Patient Emergency and Medical – Mobile
- P02 – Register Patient Identity – Desktop
- P02 – Register Patient Review – Desktop
- P02 – Register Patient Review – Mobile

### ACV7-IMPL-0131 (8)

`/app/pharmacy/prescriptions/:id/dispense` → views/activeclinic/app/pharmacy-dispense-content.ejs [DEFAULT]

- P05 – Dispense Prescription – Desktop
- P05 – Dispense Prescription – Mobile
- P05 – Dispensing Completed – Desktop
- P05 – Dispensing Confirmation
- P05 – Dispensing Review – Desktop
- P05 – Medicine Batch Detail
- P05 – Partial Dispensing – Desktop
- P05 – Select Medicine Batch

### ACV7-IMPL-0034 (7)

`/clinics/:clinicKey/book/slot` → views/activeclinic/booking/consultation-slot.ejs [DEFAULT]

- P24 - Juflona Booking - Availability States - Mobile
- P24 - Juflona Booking - Choose Slot - Desktop
- P24 - Juflona Booking - Choose Slot - Mobile
- P24 - Juflona Booking - Form States - Mobile
- P24 - Juflona Booking - Mobile Navigation and Summary Pattern - Mobile
- P24 - Juflona Booking - Progress Patterns - Desktop
- P24 - Juflona Booking - SMS Notification States - Mobile

### ACV7-IMPL-0045 (7)

`/clinics/:clinicKey/book/procedures/:procedureKey` → views/activeclinic/booking/procedure-entry.ejs [VALIDATION_ERROR]

- P25 - Juflona Booking - Preparation States - Mobile
- P25 - Juflona Booking - Procedure Form States - Mobile
- P25 - Juflona Booking - Procedure Mobile Summary Pattern - Mobile
- P25 - Juflona Booking - Procedure Progress Patterns - Desktop
- P25 - Juflona Booking - Procedure SMS States - Mobile
- P25 - Juflona Booking - Referral and Upload States - Mobile
- P25 - Juflona Booking - Resource Availability States - Mobile

### ACV7-IMPL-0094 (7)

`/app/patients/quick-register` → views/activeclinic/app/patient-form-content.ejs [DEFAULT]

- P02 – Register Patient Contact – Desktop
- P02 – Register Patient Contact – Mobile
- P02 – Register Patient Emergency and Medical – Desktop
- P02 – Register Patient Emergency and Medical – Mobile
- P02 – Register Patient Identity – Desktop
- P02 – Register Patient Review – Desktop
- P02 – Register Patient Review – Mobile

### ACV7-IMPL-0087 (6)

`/app` → views/activeclinic/app/home-content.ejs [POPULATED]

- Application Shell - Desktop
- Dashboard - Desktop
- Dashboard - Mobile
- P01 – Dashboard – Desktop
- P01 – Dashboard – Mobile
- P01 – Shared Application Shell – Desktop

### ACV7-IMPL-0018 (5)

`/clinics/:clinicKey/pricing` → views/activeclinic/tenant/pricing.ejs [DEFAULT]

- P22 - Demo Clinic - Pricing - Desktop
- P22 - Demo Clinic - Pricing - Mobile
- P22 - Juflona Clinic - Pricing - Desktop
- P22 - Juflona Clinic - Pricing - Mobile
- P23 - Juflona Public - Public Price Patterns - Desktop

### ACV7-IMPL-0023 (5)

`/clinics/:clinicKey/services` → views/activeclinic/tenant/services.ejs [DEFAULT]

- P22 - Demo Clinic - Services - Desktop
- P22 - Demo Clinic - Services - Mobile
- P23 - Juflona Public - Service States - Mobile
- P23 - Juflona Public - Services - Desktop
- P23 - Juflona Public - Services - Mobile

### ACV7-IMPL-0026 (5)

`/clinics/:clinicKey/doctors` → views/activeclinic/tenant/doctors.ejs [DEFAULT]

- P22 - Demo Clinic - Doctors - Desktop
- P22 - Demo Clinic - Doctors - Mobile
- P23 - Juflona Public - Doctors - Desktop
- P23 - Juflona Public - Doctors - Mobile
- P23 - Juflona Public - Doctors States - Mobile

### ACV7-IMPL-0031 (5)

`/clinics/:clinicKey/book` → views/activeclinic/booking/consultation-type.ejs [VALIDATION_ERROR]

- P24 - Juflona Booking - Availability States - Mobile
- P24 - Juflona Booking - Form States - Mobile
- P24 - Juflona Booking - Mobile Navigation and Summary Pattern - Mobile
- P24 - Juflona Booking - Progress Patterns - Desktop
- P24 - Juflona Booking - SMS Notification States - Mobile

### ACV7-IMPL-0035 (5)

`/clinics/:clinicKey/book/slot` → views/activeclinic/booking/consultation-slot.ejs [VALIDATION_ERROR]

- P24 - Juflona Booking - Availability States - Mobile
- P24 - Juflona Booking - Form States - Mobile
- P24 - Juflona Booking - Mobile Navigation and Summary Pattern - Mobile
- P24 - Juflona Booking - Progress Patterns - Desktop
- P24 - Juflona Booking - SMS Notification States - Mobile

### ACV7-IMPL-0105 (5)

`/app/reception/call-board` → views/activeclinic/app/reception-call-board-content.ejs [DEFAULT]

- P03 – Patient Called – Desktop
- P03 – Patient Did Not Respond — Desktop
- P03 – Queue Assignment – Desktop
- P03 – Queue Stale Data Warning – Desktop
- P03 – Transfer Patient to Department – Desktop

### ACV7-IMPL-0108 (5)

`/app/reception/queue/:entryId` → views/activeclinic/app/reception-queue-detail-content.ejs [DEFAULT]

- P03 – Patient Called – Desktop
- P03 – Patient Did Not Respond — Desktop
- P03 – Queue Assignment – Desktop
- P03 – Queue Stale Data Warning – Desktop
- P03 – Transfer Patient to Department – Desktop

### ACV7-IMPL-0150 (5)

`/app/billing/invoices` → views/activeclinic/app/billing-invoice-list-content.ejs [DEFAULT]

- P07 – Invoice History
- P07 – Invoice List – Desktop
- P07 – Invoice List – Mobile
- P07 – Unpaid Invoices – Desktop
- P07 – Unpaid Invoices – Mobile

### ACV7-IMPL-0152 (5)

`/app/billing/invoices/:invoiceId` → views/activeclinic/app/billing-invoice-detail-content.ejs [DEFAULT]

- P07 – Finalise Invoice
- P07 – Invoice Error State
- P07 – Invoice Review – Desktop
- P07 – Patient Invoice – Desktop
- P07 – Patient Invoice – Mobile

### ACV7-IMPL-0001 (4)

`/` → views/activeclinic/public/home.ejs [DEFAULT]

- P21 - ActiveClinic Public - Home - Desktop
- P21 - ActiveClinic Public - Home - Desktop
- P21 - ActiveClinic Public - Home - Mobile
- P21 - ActiveClinic Public - Home - Mobile

### ACV7-IMPL-0014 (4)

`/clinics/:clinicKey` → views/activeclinic/tenant/home.ejs [DEFAULT]

- P22 - Demo Clinic - Home - Desktop
- P22 - Demo Clinic - Home - Mobile
- P22 - Juflona Public - Home - Desktop
- P22 - Juflona Public - Home - Mobile

### ACV7-IMPL-0024 (4)

`/clinics/:clinicKey/services/:serviceKey` → views/activeclinic/tenant/service-detail.ejs [DEFAULT]

- P23 - Juflona Public - Consultation Service Detail - Desktop
- P23 - Juflona Public - Consultation Service Detail - Mobile
- P23 - Juflona Public - Informational Service Detail - Desktop
- P23 - Juflona Public - Informational Service Detail - Mobile

### ACV7-IMPL-0050 (4)

`/clinics/:clinicKey/my-booking/cancel` → views/activeclinic/booking/cancellation-review.ejs [DEFAULT]

- P26 - Juflona Booking - Cancellation Request - Desktop
- P26 - Juflona Booking - Cancellation Request - Mobile
- P26 - Juflona Booking - Cancellation Review - Desktop
- P26 - Juflona Booking - Cancellation Review - Mobile

## Implemented without Stitch

- **ACV7-IMPL-0033** `/clinics/:clinicKey/book/doctor` — INFRASTRUCTURE_SCREEN
- **ACV7-IMPL-0037** `/clinics/:clinicKey/book/patient` — INFRASTRUCTURE_SCREEN
- **ACV7-IMPL-0039** `/clinics/:clinicKey/book/submit` — INFRASTRUCTURE_SCREEN
- **ACV7-IMPL-0074** `/clinics/:clinicKey/patient/bookings/:reference` — OTHER
- **ACV7-IMPL-0076** `/login` — INFRASTRUCTURE_SCREEN
- **ACV7-IMPL-0077** `/login/select-organization` — SETTINGS_EXTENSION
- **ACV7-IMPL-0080** `/forgot-password` — OTHER
- **ACV7-IMPL-0081** `/reset-password/:token` — OTHER
- **ACV7-IMPL-0082** `/activate/:token|/reset-password/:token` — OTHER
- **ACV7-IMPL-0088** `/app` — OTHER
- **ACV7-IMPL-0089** `/app/select-facility` — SETTINGS_EXTENSION
- **ACV7-IMPL-0090** `/app/select-organization` — SETTINGS_EXTENSION
- **ACV7-IMPL-0109** `/app/booking-requests` — NEW_V7_FEATURE
- **ACV7-IMPL-0110** `/app/booking-requests/:bookingId` — NEW_V7_FEATURE
- **ACV7-IMPL-0112** `/app/clinical/start-encounter` — OTHER
- **ACV7-IMPL-0133** `/app/diagnostics` — OTHER
- **ACV7-IMPL-0153** `/app/billing/invoices/:invoiceId/post` — OTHER
- **ACV7-IMPL-0154** `/app/billing/invoices/:invoiceId/void` — OTHER
- **ACV7-IMPL-0163** `/app/cashier/session/closed` — OTHER
- **ACV7-IMPL-0165** `/app/staff` — OTHER
- **ACV7-IMPL-0168** `/app/staff/:staffId/edit` — OTHER
- **ACV7-IMPL-0170** `/app/facilities` — SETTINGS_EXTENSION
- **ACV7-IMPL-0171** `/app/facilities/new` — SETTINGS_EXTENSION
- **ACV7-IMPL-0172** `/app/facilities/:facilityKey` — SETTINGS_EXTENSION
- **ACV7-IMPL-0173** `/app/facilities/:facilityKey/edit` — SETTINGS_EXTENSION
- **ACV7-IMPL-0177** `/app/access/staff/:staffId/roles/:assignmentId/edit` — OTHER
- **ACV7-IMPL-0178** `/app/access/staff/:staffId/roles/:assignmentId/revoke` — OTHER
- **ACV7-IMPL-0179** `/app/settings` — SETTINGS_EXTENSION
- **ACV7-IMPL-0180** `/app/settings/organization` — SETTINGS_EXTENSION
- **ACV7-IMPL-0181** `/app/settings/organization/edit` — SETTINGS_EXTENSION
- **ACV7-IMPL-0182** `/app/settings/facilities` — SETTINGS_EXTENSION
- **ACV7-IMPL-0184** `/app/settings/clinic-setup/regional` — NEW_V7_FEATURE
- **ACV7-IMPL-0185** `/app/settings/clinic-setup/departments` — NEW_V7_FEATURE
- **ACV7-IMPL-0187** `/*` — INFRASTRUCTURE_SCREEN
