# V2.09 ActiveClinic Registration Browser Diagnosis

The registration flow is a two-step POST workflow.

Evidence from Chromium with local host resolution:

- URL: `http://activeclinic.pronline.org:4319/register-clinic`
- Initial form: `POST`, hidden `action=next-clinic`
- Native form validity: `true`
- Required fields: clinic name, clinic type, country
- First POST: observed and completed with HTTP 200
- Second-step form: rendered with contact name, phone, email, password, and
  password confirmation
- No browser console or page exceptions were observed

Root cause of the aborted run: test-harness timing/selector behavior. The run
used a fixed startup delay and a broad `button[type=submit]` selector after the
multi-step transition; it did not establish a bounded server-ready condition
or identify the final-step submit control. This was not evidence of a product
registration defect.

Classification: TEST_HARNESS_ERROR.

No product code or database schema was changed. A completed fresh-registration
workflow was then completed by checking the required `registration_consent`
checkbox and selecting the exact `Create clinic` submit button. The browser
reached `/register-clinic/success?ref=...&ready=1`, followed `Continue to
dashboard` to `/app`, and refresh preserved the authenticated dashboard.

The earlier final-step failure was therefore a test-harness omission of the
required terms checkbox, not a product defect. Re-login was not repeated in
the final run.
