# Billing implementation

No billing file was changed. A repeated payment in the same tenant still returns `duplicate_submission` and the stored amount. Reversal still requires `activeclinic.payment.reverse`. Another facility is `not_found`. A completed reversal is `already_reversed`. No second reversal permission was added.

D21-08 is pending, so the reversal right was not widened. No live payment was taken. A database transaction test was not run.
