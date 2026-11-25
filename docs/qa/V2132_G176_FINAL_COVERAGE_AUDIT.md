# V2.13.2 G176 final coverage audit

Base `74c0658ca60741e87edc8973d0f37338a58cd89e`. Branch `V13`. Product version stays 2.13.2. The audit uses the 38-row inventory in `docs/qa/V2132_G151_COMPLETE_FUNCTIONALITY_INVENTORY.md` and the tests that ran after G168.

## The three journeys that did not have meaningful browser coverage

G175 recorded 35 of 38. These three were the remainder. Blocked rows are not counted as verified.

### 1. AC-DISPENSE stocked success

The pharmacy route, `dispensePrescription` in `src/activeclinic/services/activeClinicPharmacyService.js`, and the clinician order path in `src/activeclinic/services/activeClinicClinicalService.js` were implemented. The browser suite only denied the receptionist. A blank catalogue id stored a clinical order and zero pharmacy rows.

Roles: a clinician creates the catalogue-backed order, a pharmacist dispenses it, a receptionist is rejected. Environment: synthetic compound on `getpro_v13_e2e_g78d2301` only.

The missing assertions were stock read, one decrement, no second decrement on retry or a concurrent second call, wrong patient, wrong facility, receptionist denial, an auditable `dispense_decrement` movement, no change when the dispense fails, no negative quantity, and a catalogue-less order staying off the queue.

That path can be tested safely. G177 adds the unit, HTTP, persistence, and Playwright coverage. It is now browser-covered. It is not a new clinical policy.

The batch lookup matched organization and healthcare organization and did not match facility. A batch from another facility in the same organization could be selected. The lookup now requires `facility_id` of the prescription and returns the existing `batch_not_found` result when it does not match. No new result code was added.

### 2. AC-SLOT

`evaluateSlotCapacity` in `src/activeclinic/services/appointmentSchedulingRules.js` returns `BLOCKED_APPROVAL_REQUIRED` with `capacity: null` and reason `slot_capacity_not_approved`. There is no approved capacity integer and no browser journey that can pass. The D25 slot test still throws `APT-01-03_NOT_IMPLEMENTED`. It was not weakened. This journey stays unverified.

### 3. D16 platform OTP

The platform OTP engine exists. `platform.otp_challenges` does not. D16 has no browser challenge-row assertion and both HTTP runs failed it. D14C has a browser gate that stays blocked and both HTTP runs failed it too. Neither is verified. The approval package is `docs/qa/V2132_G179_OTP_MIGRATION_APPROVAL_PACKAGE.md`. The migration was not created.

## Journeys that are not part of those three

AC-SIGN is browser-covered by the G168 consultation test. AC-OVERLAP already has the browser test `AC appointment creation rejects a second booking in the same slot`, and both HTTP runs passed the two-client overlap lock. The inventory line that says overlap browser is `n/a` is stale.

AC-UPLOAD is disabled. No binary upload was enabled and no success test was added. BlessBoard media already asserts the disabled upload. AC-UPLOAD is not counted as a verified upload.

## Counts after the official pair

| Item | Count |
| --- | --- |
| Major journeys | 38 |
| Browser covered | 36 |
| HTTP covered | 32 |
| Persistence verified | 14 |
| Historical QA bugs verified | 32 |
| Historical QA bugs blocked | 4 |
| P0 gaps | 0 |
| P1 gaps | 0 |

HTTP covered stays 32 because AC-DISPENSE already had an HTTP denial. The success path is now inside that same journey. Persistence rises from 13 to 14 because the stocked dispense now reads the quantity, the movement, and the prescription row back after commit.

The four blocked historical items are unchanged: AC-FU-PORTAL-04, D14C, D16, and D25 slot capacity. The other 32 still have passing regressions in the safe, HTTP, or browser runs from this cycle. No historical regression was removed or weakened.

Browser covered is 36 because stocked dispense joined the previous 35. AC-SLOT and D16 remain outside that count.
