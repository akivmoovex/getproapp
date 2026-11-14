# Persistence readiness

Nothing was written. A later disposable run, after the D44 gates are actually set, should store these rows and then stop:

1. Phone match in clinic A creates one identity and one patient link, then a redirect to login with no session cookie.
2. The same phone again leaves the identity count at one.
3. A guest token from clinic A posted to clinic B creates no identity.
4. A second portal owner on that booking is refused.
5. A reset token created for clinic A fails on clinic B, and the password hash is unchanged.
6. Two overlapping resets of the same token leave one consumed row and one password hash.
7. An expired token does not consume and does not change the password.

Do not treat two successful booking-lookup reads as a failed replay. That token stays reusable. Do not turn on OTP delivery for this run.
