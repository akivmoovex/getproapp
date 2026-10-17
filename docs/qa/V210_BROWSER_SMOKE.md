# V2.10 BB/AC Browser Smoke

Date: 2026-10-17  
Branch: `V10`

## Result

**BLOCKED**

The repository's existing Playwright configuration exposes only 12 generic GetPro public-layout/brand tests. It does not include the requested BB/AC workflow smoke coverage, nor does it configure the required 1440×900 and 390×844 viewports.

The available run started against the isolated QA database and verified two tests before the bounded run stalled:

- GetPro brand lockup stability: passed.
- Public layout bands at 375px: passed.

The run was terminated after the timeout; the remaining browser cases did not complete. No requested BB or ActiveClinic workflow can be claimed verified from this run.

QA-12 added independent BB and AC smoke specs with 1440×900 and 390×844 projects, 30-second case timeouts, two workers, console-error collection, overflow checks, and failure screenshots. The isolated server started only after the database identity was initialized. The specs then exposed a deployment-profile conflict: one server process cannot serve both the BlessBoard and ActiveClinic apex profiles simultaneously, and product apex routes returned Not Found under the generic local host. The smoke suite is therefore blocked by host/profile configuration, not recorded as a product failure.

QA-16 repaired the harness routing by using the supported unified `moovex-platform-testing` profile and forwarded hosts `blessboard.pronline.org` and `activeclinic.pronline.org`. Both desktop route probes passed against the isolated database. The bounded 12-case run exercised both required viewports: 8 passed and 4 failed. The remaining failures are two per viewport: the unauthenticated BB prayer route returned HTTP 503, and the AC registration/directory marker assertion did not match the rendered route. Screenshots and traces were retained. These are not silently counted as routing passes; the remaining route/application outcomes require follow-up.

QA-19 re-ran only those four cases. The AC failures were stale browser assertions: the supported registration/login copy is “Clinic Name” and “Log in”, and the directory route is valid without the old marker; both viewports now pass. The BB prayer route still returns HTTP 503 at both 1440×900 and 390×844, with failure screenshots/traces. This is not a host-profile failure; it is an unresolved anonymous-route/application defect or missing authenticated browser fixture and remains blocked pending product-level determination.

## Limitations

- Configured viewport: 1280×720, with one existing 375px case; 1440×900 and 390×844 were not executed.
- No existing Playwright specs cover the requested full BB/AC journey list.
- No product failure was established and no failure screenshot was produced.
- QA-12 generated failure screenshots and traces for the blocked route assertions.
- No runtime code, production data, or external delivery was touched.
