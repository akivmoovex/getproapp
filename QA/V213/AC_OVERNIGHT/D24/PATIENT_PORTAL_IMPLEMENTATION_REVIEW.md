# Patient portal implementation review

Branch `V13` at `b8f6b420d25e908de64ba292866c218c32edc30c`. No product file was edited.

Staff-created patients and portal accounts are separate. `patientDomainConstants.js` says portal access starts at `none`, and `assertPatientDoesNotRequirePortal` returns `requiresPortal: false`.

Public registration is `GET` and `POST /clinics/:clinicKey/patient/register`. A guest token calls `registerPatientWithGuestToken`. Without one, the form requires a first and last name and calls `registerPatientWithPhoneMatch` inside the clinic organization from the URL. Success redirects to `/clinics/:clinicKey/patient/login`. The register handler does not call `issueAuthenticatedSessionCookie`.

Phone match links an existing active patient only when the normalized phone, organization, healthcare organization, and both names agree, and the patient has no `platform_identity_id`. More than one row returns `ambiguous_patient_match` and does not merge. A guest token links the booking to the new portal identity. It links the clinic patient only when that booking already has a patient id in the same organization.

`matchGuestPatient` still returns `patientId: null`, so a public booking does not create or attach the portal by itself.

Patient login is a separate `POST /clinics/:clinicKey/patient/login`. A failed login renders one message, `Invalid credentials or access unavailable.` A successful password check then calls `issueAuthenticatedSessionCookie` with `otpWorkflow: "activeclinic.patient_login"`. Production OTP activation remains `BLOCKED` even when the override is `ACTIVE`. No provider was configured and no message was sent.

`/activate/:token` is the staff account route in `activeClinicLifecycleRoutes.js`. It is not the patient portal route.
