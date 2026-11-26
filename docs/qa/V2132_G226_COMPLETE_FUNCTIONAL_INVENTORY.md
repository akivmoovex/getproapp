# G226 complete functional inventory

This is a source-to-test inventory of the implemented V13 surfaces. A page
load is not counted as workflow proof. `P` means a real PostgreSQL read-back
exists; `M` means mock/in-memory only; `B` means blocked or not executed.

| Product | Module | Major journey | Entry/source | Roles | Unit/contract | HTTP | Browser | Persistence | Security | Status / gap |
|---|---|---|---|---|---|---|---|---|---|---|
| ActiveClinic | identity | clinic registration, login, logout | `activeClinicAuthRoutes.js` | public, staff | P | P | P | P | P | covered |
| ActiveClinic | reception | patient registration and walk-in | `activeClinicReceptionRoutes.js`, `activeClinicPatientRoutes.js` | reception, admin | P | P | P | P | P | covered |
| ActiveClinic | reception | patient name/phone/ID search and queue | reception routes | reception | P | P | P | P | P | covered locally; hosted retest pending |
| ActiveClinic | clinical | encounter, SOAP draft/sign/complete | clinical routes/service | clinician | P | P | P | P | P | substantial, some SOAP fields need deeper independent cases |
| ActiveClinic | clinical | vitals and append-only correction | clinical service | nurse, clinician | P | P | P | P | P | covered locally |
| ActiveClinic | diagnostics | lab order → collect → receive → result → verify | diagnostics routes/service | clinician, lab | P | P | P | P | P | G224/G228 covered |
| ActiveClinic | diagnostics | radiology order → report → verify | diagnostics routes/service | clinician, radiology | partial | partial | partial | B | P | P1 coverage gap |
| ActiveClinic | diagnostics | lab/radiology queues and counters | diagnostics loaders | diagnostics roles | P | P | partial | P | P | G230 depth gap |
| ActiveClinic | pharmacy | prescription → queue → stocked dispense | pharmacy routes/service | clinician, pharmacist | P | P | P | P | P | covered |
| ActiveClinic | billing | invoice, cashier, payment/refund | billing/cashier routes | billing, cashier | P | P | P | partial | P | financial policy boundaries remain |
| ActiveClinic | portal | activation, patient login, clinical read-back | patient portal routes | patient | P | P | P | P | P | local; OTP recovery blocked |
| ActiveClinic | website | draft, theme, publish, public read-back | website CMS routes | clinic admin | P | P | P | P | P | uploads intentionally disabled |
| ActiveClinic | community | membership, pass, eligibility, lookup, settlement preview | community benefits service/routes | reception, clinic admin | P/M | P | M | B | P | persistence blocked by schema |
| BlessBoard | church | registration, activation, login | tenant/auth routes | church admin | P | P | P | P | P | covered |
| BlessBoard | membership | member create/activate/portal | member routes/services | staff, member | P | P | P | P | P | covered |
| BlessBoard | website | draft/theme/publish/public read-back | website admin routes | editor, publisher | P | P | P | P | P | covered |
| BlessBoard | content | sermons, events, announcements | content routes | church staff | P | P | P | P | P | covered |
| BlessBoard | governance | invitations, roles, branches, isolation | HQ/branch routes | admins | P | P | P | P | P | covered |
| Shared platform | security | CSRF, sessions, RBAC, tenant scope, audit | platform HTTP/services | all | P | P | P | P | P | covered |
| Shared platform | OTP | challenge persistence and cross-worker verification | OTP service | auth | P | B | B | B | P | blocked by absent schema |
| Shared platform | booking | same-staff overlap | appointment service | staff | P | P | P | P | P | covered; slot capacity policy blocked |

Important interactive actions still requiring deeper independent coverage are
the full radiology journey, diagnostics status truth tables across facilities,
the supported clinical print surfaces beyond the new laboratory result, and
some SOAP/referral fields. These are recorded as P1 coverage gaps rather than
being misreported as complete.
