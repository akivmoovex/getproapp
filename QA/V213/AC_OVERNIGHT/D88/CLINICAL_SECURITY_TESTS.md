# Clinical security tests

`tests/v13/contract/d88-clinical-operations-contract.test.js` has two tests. Both passed.

They lock the signed-note preference, the absence of an amendment in that function, the patient-scoped acknowledgement, the absence of `result_id` and escalation in that function, the absence of an allergy check, and the dispense update that does not replace the prescriber.

The D74 unit tests still cover the wrong-patient and already-dispensed denials. No new browser or database test was executed. G2 and G3 stay not run.
