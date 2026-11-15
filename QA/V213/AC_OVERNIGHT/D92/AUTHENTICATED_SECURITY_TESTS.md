# Authenticated security tests

No browser session was started.

The prepared AC-05 test calls `hold()` before any page action. It uses `E2E_AC05_LOWER_EMAIL` only after that hold returns. A redirect to `/login` is not the required denial. The cashier billing check is a different route and is not AC-05.

CSRF, revoked sessions, and a BlessBoard account opening an ActiveClinic patient record were not exercised. No production host was configured.
