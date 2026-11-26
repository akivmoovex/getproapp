# G235 platform security

Existing contract, unit, HTTP and browser suites cover CSRF issuance and
rejection, session boundaries, tenant/facility isolation, RBAC denial,
AC-05 database-management denial, audit paths, secret-safe logging, feature
flags and the OTP completion boundary.

D14C and D16 remain honest failures because `platform.otp_challenges` is not
present. Missing challenge persistence is fail-closed. D25 capacity remains
policy-blocked while same-staff overlap passes. No OTP schema, production
provider, real email/SMS, or financial posting was enabled.
