# Patient identity fixes

The change is in `src/activeclinic/services/activeClinicPatientPortalRegistrationService.js`.

| Path | Result |
|---|---|
| Guest registration for another clinic | `invalid_guest_token`. No identity insert |
| Guest registration with no clinic id | `invalid_input` before the service booking read |
| Link with a patient id from another clinic | `no_patient_match`. The booking is not claimed |
| Second activation when a portal owner already exists | Still `link_conflict`, from the existing check |
| Staff-created patient | Still does not require a portal |
| Public booking token | Still not consumed |

Phone-match registration was not given a new identity rule. It already requires the caller’s organization. Registration still does not issue a session. No production OTP rule was changed.
