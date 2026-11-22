# V13 G58 — prescription and pharmacy

The prescription form remains manual. It now has an optional dose unit and an optional catalogue item id. The id does not choose a medication and does not query a catalogue by itself. Drug, dose, frequency, and duration are still required. A missing dose still returns null. Quantity must still be a whole number; the placeholder no longer suggests `14 tablets`.

`dispensePrescription` rejects a request that lists the same prescription item twice, before it opens a transaction. The remainder check and dispense permission are unchanged. No dose recommendation, substitution rule, or external pharmacy connection was added.

```
PRESCRIPTION_ENTRY=IMPLEMENTED_UNVERIFIED
PHARMACY_DISPENSING=PARTIAL
PRESCRIBING_POLICY=MANUAL
HTTP_TESTS=NOT_RUN
```
