# G153 patient and reception coverage

Executed twice in the ActiveClinic Playwright file, 28 passed each time. Database `getpro_v13_e2e_g78d2301` at `127.0.0.1:55432`.

Covered with UI interaction and an outcome assertion:

- Staff login and role isolation.
- Patient creation through review, including the phone on the review step in the portal journey.
- Patient number search, detail reload, a missing number that does not show the new chart, and logout back to login.
- Staff phone search that shows the existing chart and leaves `activeclinic.patients` count at 1 for that number.
- A phone that does not match shows no find-match list.
- Staff-created portal activation, patient login, unknown public user rejected, wrong-clinic activation denied.
- Walk-in on the clinic service point.
- New patient on the reception queue.
- Existing patient number checks in without a second chart.
- Clinical worklist can be opened by clinical staff.
- Receptionist is denied the practitioner worklist.

Public self-registration stays off. The unknown-registration assertion is the approved boundary. Public booking was not enabled.

Clinic onboarding for a brand-new clinic is covered by the website tests that register a clinic before editing the site. A separate onboarding product tour was not added.
