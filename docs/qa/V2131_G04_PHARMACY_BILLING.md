# V2.13.1 G04 — pharmacy and billing

The healthcare brief is still not on disk. No medication price, tax rate, or payment-provider agreement was added. Stock purchasing stays on the existing purchase-order tables and was not expanded.

## Pharmacy

The medication catalogue, prescription queue, dispense events, substitution records, and dispense permission `activeclinic.pharmacy.dispense` already exist in `activeClinicPharmacyService.js` and `activeClinicPharmacyOpsService.js`. Dispense rows are not deleted.

A clinician prescription now has to include medication name, dose, frequency, and duration before an order is inserted. Those words are stored as entered. They are not turned into a dosing rule. A mixed quantity such as `14 tablets` is not parsed into a number.

The pharmacy queue receives that order only when the request also names a medication catalogue item in the same organization and a whole-number quantity. A manual prescription without a catalogue item remains a clinical order and is not given a made-up medicine. The current prescription form does not send a catalogue id, so that handoff stays unused until a later approved picker exists.

## Billing

Tariffs, encounter charges, invoices, receipts, payments, outstanding balances, voids, reversals, and revenue summaries already use integer minor units in `activeClinicBillingService.js` and `activeClinicBillingOpsService.js`. Completed payments and receipts are not deleted. Routes require the existing billing permissions. No payment processor is called, and no invoice is sent to a patient.

Clinical notes are not copied onto invoice lines by this phase. An invoice stays linked to the patient and facility already stored on the billing row.

No migration was prepared. Pharmacy tables are in `db/migrations/activeclinic/016_pharmacy_stock.sql`. Billing tables are in `db/migrations/activeclinic/018_billing_cashier.sql` and `025_phase4_pharmacy_billing_gaps.sql`.

Database-free tests passed 456 and failed 0. The new HTTP file skips unless disposable database writes are authorized. Playwright was not run.

```
FINAL=V2131_G04
PHARMACY_CATALOGUE=PRESENT
PRESCRIPTIONS=FIELDS_REQUIRED_QUEUE_NEEDS_CATALOGUE_ITEM
DISPENSING=PRESENT_HTTP_NOT_RUN
TARIFFS=PRESENT
INVOICES=PRESENT
PAYMENTS=PRESENT_NO_PROCESSOR
RECEIPTS=PRESENT
FINANCE_REPORTING=PRESENT
SAFE_TESTS_PASSED=456
SAFE_TESTS_FAILED=0
MIGRATIONS_PREPARED=0
BLOCKERS=Healthcare brief absent; HTTP and browser NOT_RUN; manual prescriptions without a catalogue item do not enter the pharmacy queue; stock expansion remains deferred; G05 prompt was not in this request
```
