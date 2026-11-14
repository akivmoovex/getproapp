# Pharmacy contracts

An empty dispense list returns `invalid_input` before the permission check and before `pool.connect`.

A non-empty dispense asks for `activeclinic.pharmacy.dispense`. The cashier catalogue block does not contain that key. The denial itself was not executed, so `RX-01-02` stays partial.

Substitution columns are mapped on prescription items. There is no `approveSubstitution` function. The service does not block a dispense on an allergy threshold. D21-07 and D29-17 remain pending. No prescribing rule was added.

Dispense of a real item was not run. `RX-01-01` stays not executed.
