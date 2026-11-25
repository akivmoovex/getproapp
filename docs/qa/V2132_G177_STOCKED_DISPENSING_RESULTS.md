# V2.13.2 G177 stocked dispensing results

Synthetic compound only. No real medicine and no clinical prescription for a real patient. Stock was created through `addMedication` and `receiveStock`. The clinician order was created through `createClinicalOrder` after an administrator opened the encounter. The pharmacist was a new run-owned staff member with the existing `activeclinic_pharmacist` role. The second facility was created through `createFacility` in the same healthcare organization. Public booking stayed disabled. Preflight on both official HTTP runs reported booking-enabled clinics `0`, churches `78`, and clinics `909` then `926` after the new synthetic facilities.

Database `getpro_v13_e2e_g78d2301` at `127.0.0.1:55432`. Port 5432 was not used.

## What the tests assert

1. The clinician order with a catalogue id appears on the pharmacist queue.
2. The order without a catalogue id creates no `pharmacy_prescriptions` row.
3. Starting quantity is 5 at the prescription facility and 4 at the other facility.
4. Dispensing 10 when 5 are available returns `insufficient_stock` and leaves both quantities unchanged.
5. A different patient id returns `patient_not_found` and leaves stock unchanged.
6. The other facility's batch returns `batch_not_found` and leaves both quantities unchanged.
7. The receptionist returns `access_denied` and leaves stock unchanged.
8. Two concurrent dispense calls produce one success. Quantity becomes 3. The other facility stays 4.
9. A third call returns `invalid_status`. Quantity stays 3. One `dispense_events` row exists.
10. The `dispense_decrement` movement has quantity delta `-2`, the prescription facility, and the pharmacist. The prescription status is `dispensed`, the prescriber is the clinician, and the patient, organization, and facility match the order.
11. The browser journey signs in as the receptionist, receives 401 or 403, then the pharmacist selects the facility batch, confirms, and the completed heading is shown. Quantity moves from 5 to 3 once. A later load does not move it again.

The unit test `rejects a batch from another facility before stock moves` locks the facility predicate and the rollback. It does not open a database.

## Official results

| Run | Result |
| --- | --- |
| Unit, inside both safe runs | PASS |
| HTTP run 1 and run 2 | PASS, inside 33 of 36 |
| ActiveClinic Playwright run 1 and run 2 | PASS, inside 30 passed |
| Persistence | PASS |

`STOCKED_DISPENSING=PASS`. No negative stock was produced. Failed calls did not change quantity.
