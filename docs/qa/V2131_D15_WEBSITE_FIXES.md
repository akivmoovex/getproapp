# V2.13.1 D15 — website sections and themes

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. D04–D14 files were left in place. No database, role, migration, browser, website publish, or production OTP was used.

Safe contract and unit tests: 419 passed, 0 failed. Related section and theme unit tests also passed: 21. The D05 HTTP and Playwright suites were not executed. None of these fixes is verified by an authorized regression pass.

## AC-WEB-08

A new homepage section now gets one UUID. That id is the settings URL, the `cms.section.{id}` entity key, and the public `data-ac-cms-section-id`. Heading, body, visibility, and image fields stay on the existing section record. `bodyText`, `buttonLabel`, and `buttonUrl` map onto the stored `body`, `button_label`, and `button_url` fields.

The section is saved as a draft. Preview reads the draft. The live page reads the published copy, so an unpublished heading stays off the public page. A section that does not belong to the signed-in clinic returns 404. A caller without website edit permission returns 403. Image values still use the existing image object.

## AC-WEB-09

Theme selection and public rendering now use the same decision. A stored theme envelope `{v: id}` resolves to the theme id. Draft preview uses the draft theme. The public page uses the published theme, so selecting `ac.family-wellness-mint` does not change the live page until publish. `bb.community` is rejected as `invalid_theme` and is absent from the ActiveClinic gallery.

## BB-WEB-08

The church public page uses the same theme decision and its own templates. Draft preview can show `bb.community`. The live home page shows that class only after the published theme is `bb.community`. `ac.family-wellness-mint` is rejected and is absent from the BlessBoard gallery. Draft rows are still copied to published rows only by the existing publish path.

## Still blocked

Authorized HTTP and browser runs are not done. No website row was written, and the disposable database and least-privilege role from D12 were not created.

FINAL=V2131_D15
BUGS_TARGETED=3
FIXED_IN_SOURCE=AC-WEB-08, AC-WEB-09, BB-WEB-08
PARTIAL=
BLOCKED=
SAFE_TESTS_PASSED=419
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
DATABASE_MUTATION=NO
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
BLOCKERS=Authorized HTTP and browser regression was not run. No website draft or publish was written.
