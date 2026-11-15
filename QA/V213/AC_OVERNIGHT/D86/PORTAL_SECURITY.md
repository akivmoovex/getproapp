# Portal security

Reset still selects the token by hash, purpose, and `organization_id`. Expiry returns `token_expired` before consume. A second use returns the existing consumed result. Those cases remain the D72 tests.

Registration does not call `createSession`. A second portal owner on a booking stays `link_conflict`. The booking access token is not revoked. No production OTP bypass was added. Account errors stay the existing distinct codes, so a missing patient is not rewritten into a generic success.

Live portal persistence was not run.
