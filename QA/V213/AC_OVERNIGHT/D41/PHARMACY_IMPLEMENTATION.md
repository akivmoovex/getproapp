# Pharmacy implementation

Dispense still requires `activeclinic.pharmacy.dispense`. The cashier catalogue still does not include that permission. An empty item list still returns `invalid_input` before a connection.

The stock row locked during dispense now matches `organization_id` as well as the batch’s item id. The prescription load was already limited to the caller’s organization, and each item must belong to that prescription.

No substitution function was added. Allergy text is still not a dispense block. No stock movement was posted.
