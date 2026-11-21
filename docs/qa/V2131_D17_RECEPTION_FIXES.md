# V2.13.1 D17 — ActiveClinic reception and booking

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. D04–D16 files were left in place. No database, role, migration, browser, or production OTP was used. Appointment concurrency controls and patient portal policies were not changed.

Safe contract and unit tests: 424 passed, 0 failed. The D04 and D05 HTTP suites and the Playwright specs were not executed. None of these fixes is verified by an authorized regression pass.

## AC-REC-02

A facility administrator with queue management can add a service point for the signed-in facility from the walk-in page. The insert uses the existing `service_points` columns and the existing service-type check (`general`, `triage`, `consultation`, `laboratory`, `pharmacy`, `radiology`, `cashier`, `records`, `other`). A posted organization or facility id that does not match the session is rejected. The walk-in list keeps only active points for that facility that accept walk-ins. The queue detail still prints `servicePoint.displayName`, which is the same name shown on the option. A patient number from another clinic returns "Patient not found." A service point from another facility returns "Service point is unavailable." before an arrival is created. Check-in staff can place the arrival on the queue with the check-in permission the walk-in route already requires.

## AC-REC-03

Vitals entry still posts one observation at a time under the clinical triage permission and CSRF. The allowed types are the existing `vital_sign_observations` check: blood pressure, heart rate, respiratory rate, temperature, oxygen saturation, weight, height, BMI, and other. Pain score is not added. A heart rate without a finite number is rejected before insert. Blood pressure requires systolic and diastolic. After reload, a stored decimal heart rate of 72 is displayed as `72 bpm`. Encounter load and the observation list still filter by both organization and facility, so another clinic's post does not become a redirect and does not appear on the record.

## AC-PUB-01

Public booking stays off unless `public_booking_enabled` is strictly true. The column default remains false. An anonymous request for a disabled clinic returns 403 with "Booking not available", "Online booking is not enabled", and "does not take live bookings." Website chrome cannot replace that copy. The disabled page has no coupon field and does not confirm an appointment. Enabled booking, booking confirmation, and coupon or voucher entry stay deferred.

## Still blocked

Authorized HTTP and browser runs are not done. No patient, queue entry, vital observation, service point, or booking row was written, and the disposable database and least-privilege role from D12 were not created.

FINAL=V2131_D17
BUGS_TARGETED=3
FIXED_IN_SOURCE=AC-REC-02, AC-REC-03, AC-PUB-01
PARTIAL=
BLOCKED=
BOOKING_COUPON=DEFERRED
SAFE_TESTS_PASSED=424
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
DATABASE_MUTATION=NO
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
BLOCKERS=Authorized HTTP and browser regression was not run. No patient, queue, vitals, service-point, or booking row was written.
