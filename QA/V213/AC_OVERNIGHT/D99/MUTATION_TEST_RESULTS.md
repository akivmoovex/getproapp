# Mutation results

The D17 probes passed 3. They load mutants from temporary files outside the repository. A draft announcement made public, a removed CTA field type, an end-before-start check turned off, a body-supplied church id, a disabled production OTP rejection, and a disabled facility-only role check each changed the result the probe asserts.

A separate mutant of `isUsableAssignedStaffId` returned true for `not-a-staff-id`. The existing expectation rejects that value, so the mutant is killed by the unit tests. `npm run test:v13:ac` does not include `d98-coverage-boundaries.test.js` or the appointment rule tests, so that mutant survives Stage A.

The working-tree function still returns false for `not-a-staff-id`. `git diff --name-only -- src` is empty.
