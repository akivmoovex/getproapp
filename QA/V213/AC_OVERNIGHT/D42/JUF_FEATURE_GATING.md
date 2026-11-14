# Juflona feature gating

Juflona signing stays off. `activeClinicDemoClinicSpec.js` still has no `signingEnabled`, `patientDisplay`, or `twoScreen`. Access management still has no break-glass.

No device-pairing record was created. A later patient-display batch needs an approved pairing secret, which device may show which patient, and proof that the display cannot query another organization. D21-13 is pending, so that batch was not started.
