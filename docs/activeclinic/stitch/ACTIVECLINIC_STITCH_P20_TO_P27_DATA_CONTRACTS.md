# ActiveClinic Stitch — P20–P27 Data Contracts

**Audited:** 2026-08-04
**Stitch design project:** `projects/17813606734422395399` (Public Ecosystem & Booking Flow)  
**Clinical project:** `projects/12272131183982732110` (no P20–P27 screens)

## Entities

| Entity | Source | Public fields | Writes from public |
|--------|--------|---------------|--------------------|
| Healthcare organization | `activeclinic.healthcare_organizations` + platform org | `public_name`, website fields, publish flags | Never ownership; onboarding application only |
| Facility | `activeclinic.facilities` | Address, phone, email, hours, directory flag | None |
| Clinic registration application | **new** `clinic_registration_applications` | Applicant inputs | INSERT application (`pending`) |
| Appointment service type | `appointment_service_types` | Active catalogue display | None |
| Public procedure | **new** `public_procedures` | Catalogue + prep text from config only | None |
| Public booking request | **new** `public_booking_requests` | Patient-safe summary | INSERT pending request |
| Booking access token | **new** `public_booking_access_tokens` | Opaque token | Issued on submit; lookup |
| Contact inquiry | **new** `public_contact_inquiries` | Confirmation of receipt only | INSERT |
| Patient | `patients` | Never listed publicly | Guest match/create via approved service |
| Appointment | `appointments` | Linked after clinic confirm when applicable | Not confirmed by public submit |
| Staff / doctor public profile | staff + **new** public profile flags | Name, title, bio if published | None |
| Referral upload | **deferred** | Status only | Upload pending / clinic follow-up if no AC media |

## Publication rules

A clinic appears in the directory / resolves on tenant routes only when **all** are true:

1. Platform organization `status = active`
2. ActiveClinic product enrolment `status = active`
3. Healthcare organization `status = active`
4. `website_published = true` (HCO)
5. At least one facility with `status = active` and `show_in_directory = true` (for directory; tenant home may use primary facility)

Never accept `organizationId` from client forms. Resolve by `clinicKey` = platform `organization_key`.

## Booking request states

`draft` (session) → `submitted_pending_confirmation` → (`confirmed` via staff) | `cancelled` | `expired` | `unavailable`

Public UI must not label `submitted_pending_confirmation` as confirmed.

## Notification honesty

SMS / WhatsApp / email screens in P24–P26 are **pattern references**. Delivery is claimed only when a real integration sends a message. Default: show “notification not sent — clinic will contact you” / scheduled-intent states.
