# V2.13.2 G178 persistence and browser results

Disposable database `getpro_v13_e2e_g78d2301` at `127.0.0.1:55432` only. Both HTTP preflights confirmed that database, port 55432, testing identity, migrations 043 and 044 present, and public booking off. No database was reset. No new migration ran. Only rows created by the stocked-dispense fixture were written for this cycle, plus the rows the existing authorized suites already create.

## New persistence

AC-DISPENSE now reads back `inventory_items.current_quantity`, one `stock_movements` row of type `dispense_decrement`, one `dispense_events` row, and the prescription status, prescriber, patient, organization, and facility. A failed dispense and a retry leave the quantity where it was. That moves persistence verified from 13 to 14.

## Review of the other write journeys

These already had a read-back in the passing browser or HTTP tests. No second copy was added.

| Journey | Existing proof |
| --- | --- |
| AC patient activation | Portal SQL count and one sign-in |
| AC patient registration | Chart count, including the duplicate phone search that stays at 1 |
| AC walk-in and queue | Queue row and existing-number chart count |
| AC vitals | Reload shows 72 and the appended 80 |
| AC consultation | Draft text, then signed status, signer, and unchanged text after the other clinic posts |
| AC website publication | Public reload after publish |
| AC appointment booking | Browser collision text and HTTP one-row overlap |
| BB church registration | One church row for a duplicate phone |
| BB member creation | Directory search and profile reload |
| BB staff invitation | Replay denied |
| BB website, sermon, event, announcement | Public read after publish, hidden for the other church |

Read-only journeys were left without a new write assertion. AC-SLOT, D14C, D16, and AC-FU-PORTAL-04 stay blocked and were not marked verified. AC-UPLOAD and BlessBoard media upload stay disabled.

## Browser

Both official ActiveClinic runs passed 30 tests, including the new stocked-dispense journey. Both BlessBoard runs passed 23. Same-staff overlap passed in the browser collision test and in both HTTP runs. D25 slot capacity failed both HTTP runs.
