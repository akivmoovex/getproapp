# V2.13.1 D26 — ActiveClinic browser fixes

Parent `90d63f600134efa3f74709520a51aea7e17dae81`. No database writes, HTTP runs, or browser runs.

## AC-WEB-09 theme CSRF

The themes page issued one CSRF token into the gallery and then `renderShell` issued a second token into the cookie. Apply to draft posted the first token, and the route returned `csrf`.

`renderShell` now keeps a token that the page already issued and writes that same token to the cookie. A missing or mismatched token still returns 403. Draft save still does not publish, and a theme from another product is still rejected.

## AC-REC-02 walk-in service points

Eligible active points for the selected facility are still the only options. Another facility’s points stay out. When the facility has none, the page no longer shows a required empty dropdown. It tells the receptionist that a service point must be added for this facility. `accepts_scheduled` does not turn public booking on.

## AC-REC-03 nurse vitals

The clinical queue only offered Start encounter to staff with `activeclinic.encounter.manage`, and the waiting link passed a patient number into a form that reads a patient id. A nurse with `activeclinic.triage.record` now sees Start triage and Record vitals. Start triage opens an encounter and continues to the vitals form. A receptionist without triage permission still cannot record vitals. Facility checks stay in place.

## AC-AUTH-04 recovery

The testing outbox and neutral response were already in `activeClinicPasswordRecoveryService`. This phase did not add a production email or SMS call. HTTP reset was not executed.

## AC-PUB-01 booking

Public booking stays disabled unless `publicBookingEnabled` is true. The disabled page title remains “Booking not available”. Coupons and enabled booking stay deferred.

```
FINAL=V2131_D26
BRANCH=V13
HEAD_SHA=90d63f600134efa3f74709520a51aea7e17dae81
AC_THEME_CSRF=SOURCE_CORRECTED
AC_WALKIN_SERVICE_POINT=EMPTY_FACILITY_GUIDANCE
AC_NURSE_VITALS=TRIAGE_ACTION_ADDED
AC_PASSWORD_RECOVERY=TESTING_OUTBOX_UNCHANGED
AC_PUBLIC_BOOKING=DISABLED
SAFE_TESTS_PASSED=447
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
DATABASE_MUTATION=NO
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
BLOCKERS=HTTP and browser assertions were not run
```
