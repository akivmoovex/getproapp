# Security fixes

Guest booking activation and linking now re-read the booking with the caller’s organization and healthcare organization. A token for clinic A presented by clinic B no longer uses an id-only lookup. A missing clinic id is rejected before that service read. The booking access token is not revoked. That remains the public lookup token.

`linkGuestBookingToPatient` refuses a patient id that is not in the caller’s clinic before it updates the booking or writes a link event. A repeated link by the same portal identity is unchanged when no foreign patient id is supplied.

AC-05 route guards were not changed. The in-process denial still uses a query double. It is not a signed-in 403.
