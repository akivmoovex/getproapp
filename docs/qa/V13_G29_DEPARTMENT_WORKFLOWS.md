# V13 G29 — laboratory, pharmacy, and billing

No payment provider, tariff amount, drug rule, or reference range was added.

## Laboratory

Orders, queues, specimens, and results are already in `activeClinicDiagnosticsService` and the clinical order path. Priority is only `routine`, `urgent`, or `stat`. A result stores `is_abnormal` and `is_critical` only when the caller supplies them. Critical acknowledgement updates the existing alert. A general non-critical review status is not in the stored result check, so it was not invented.

## Pharmacy

The catalogue, dispense permission, substitution records, and dose, route, frequency, and duration fields already exist. The queue receives a prescription only when the order names a catalogue item in the same organisation and a whole-number quantity. The manual form does not send that id. Stock expansion stays deferred.

## Billing

Tariffs, charges, invoices, receipts, payments, balances, voids, and reversals already use integer minor units. `duplicate_submission` and `already_reversed` remain. No invoice was issued and no money moved.

```
LABORATORY=PARTIAL
PHARMACY=PARTIAL
BILLING=IMPLEMENTED_UNVERIFIED
```
