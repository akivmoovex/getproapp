# Billing implementation

A repeated payment key in the same tenant returns the stored payment and does not insert another row. A retry that names a different amount still returns the stored amount of 2500. The retry note is not echoed.

A reversal still requires `activeclinic.payment.reverse`. A payment in another facility is not reversed. A payment that already has a completed reversal is not reversed again. No new reversal right was added, and no payment was stored.
