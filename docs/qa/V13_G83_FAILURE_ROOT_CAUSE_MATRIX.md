# V13 G83 failure root-cause matrix

Source logs, not reclassified without the captured error:

- HTTP: `.v13-isolated-pg/g82-http.log` (34 executed, 16 passed, 18 failed, 0 skipped)
- Playwright ActiveClinic: `.v13-isolated-pg/g82-ac.log` (20 executed, 15 passed, 5 failed)
- Playwright BlessBoard: `.v13-isolated-pg/g82-bb.log` (23 executed, 2 passed, 21 failed)
- Later rerun: `.v13-isolated-pg/g82-ac-focus.log` (3 executed, 0 passed, 3 failed). Those three are not part of the 43.

Database for every row: `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`.

## HTTP failures (18)

| TEST_ID | PRODUCT | SCENARIO | TEST_FILE | EXPECTED | ACTUAL | ROOT_CAUSE | REPAIR | PRIORITY |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BB-06 | BlessBoard | Member activation | `bb06-member-activation.integration.test.js` | Accept invitation and sign in | `authenticated_ownership_required` | Product rejects the synthetic member as not owning the invitation | Trace invitation ownership. Do not invent a token | P1 |
| BB-24 | BlessBoard | Enquiry without a resolved church | `bb24-public-directory.integration.test.js` | 404, posted church id ignored | 400 | Body validation ran before the missing-scope check | Check church scope first. Unit tests already expect 404 | P1 |
| BB-AUTH-04 | BlessBoard | Member OTP recovery | `d04-critical-regression.integration.test.js` | Expired testing code is present | `expiredCode` falsy | Testing OTP was not captured after the verify attempt | Do not add `platform.otp_challenges` | P2 |
| BB-ANN-01 | BlessBoard | Public announcement | `d04-critical-regression.integration.test.js` | `data-bb-announcements="1"` | 741-byte setup page | `loadTenantPublicPageModel` returns SETUP while `publicWebsiteStatus` is not `published` | Publish the church website in the scenario, then retest. Do not render an unpublished site | P1 |
| AC-WEB-08 | ActiveClinic | Section settings | `d05-regression.integration.test.js` | CSRF on the section page | 404, CSRF missing | `listSections` for `tpl_home` does not contain the id the test opens | Trace section id versus page id | P1 |
| AC-REC-02 | ActiveClinic | Walk-in patient | `d05-regression.integration.test.js` | `Patient created` | 200 form, text absent | Fixed name `D05 Walker` hits the duplicate warning. Browser snapshot showed that warning | Unique surname. Duplicate refusal stays | P1 |
| AC-REC-03 | ActiveClinic | Vitals patient | `d05-regression.integration.test.js` | `Patient created` | Same as AC-REC-02 | Same duplicate name `D05 Vitals` | Unique surname | P1 |
| AC-PUB-01 | ActiveClinic | Booking disabled | `d05-regression.integration.test.js` | `Online booking is not enabled` | 403 title `Clinic unavailable` | New clinic is not a published public clinic, so booking never reaches the disabled-booking copy | Keep booking off. Assert the closed state that this clinic actually returns | P2 |
| BB-WEB-08 | BlessBoard | Theme gallery | `d05-regression.integration.test.js` | 200 `/hq/website/themes` | 303 to `/c/{key}/website/themes` | Canonical church path redirect. Destination not followed | Follow one redirect and assert the gallery | P2 |
| BB-WEB-09 | BlessBoard | Public sermon | `d05-regression.integration.test.js` | `data-bb-sermons="1"` | Setup page, 741 bytes | Same unpublished-website gate as BB-ANN-01 | Shared with public-page publication | P1 |
| BB-WEB-10 | BlessBoard | Public event | `d05-regression.integration.test.js` | `data-bb-events="1"` | Setup page, 741 bytes | Same unpublished-website gate | Shared | P1 |
| BB-ANN-02 | BlessBoard | Attachment upload | `d05-regression.integration.test.js` | 200 upload | 403 `media_uploads_disabled` | Approved disabled state. Flag is unset | Assert 403 while the flag is unset. Do not enable uploads | P1 |
| D14C | Shared | OTP challenge row | `d14c-otp-auth.integration.test.js` | Challenge table present | Table absent | Approved contract. Migration must not be added | Leave blocked | P0 blocker |
| D16-AC | ActiveClinic | Clinic registration | `d16-ac-auth.integration.test.js` | Facility and administrator | Registration returned neither | Registration completion does not return those records for this run | Trace registration result. Do not weaken auth | P1 |
| D16-OTP | Shared | Shared OTP | `d16-platform-otp.integration.test.js` | Challenge table | Table absent | Same approved contract as D14C | Leave blocked | P0 blocker |
| D25-slot | ActiveClinic | Slot capacity | `d25-appointment-concurrency.integration.test.js` | Lock inside the appointment transaction | `APT-01-03_NOT_IMPLEMENTED` | Approved unimplemented lock | Do not implement in this repair | P0 blocker |
| D25-overlap | ActiveClinic | Staff overlap | `d25-appointment-concurrency.integration.test.js` | In-transaction overlap check | `BLOCKED_APPROVAL_REQUIRED` | Check remains outside the transaction | Do not implement without approval | P0 blocker |
| INV-01 | BlessBoard | Staff invitation | `inv01-staff-invitation.integration.test.js` | One invitation accepted | `staff invite failed: conflict` | Invitation create conflicts with an existing identity | Trace the conflict. Do not invent a token | P1 |

## Browser failures (26)

ActiveClinic, `tests/e2e/v13/v13-ac-platform-qa.spec.js`:

| TEST_ID | EXPECTED | ACTUAL | ROOT_CAUSE | CLASS |
| --- | --- | --- | --- | --- |
| AC-AUTH-04 | Replayed reset token returns 400 or 403 promptly | `page.request.post` still running at the 90s test timeout | HTTP GET replay already returns 400. The browser API client did not complete | Browser client hang. Replay must use a bounded same-origin fetch |
| AC-WEB-08 | Published section heading on the public page | Heading absent. Page is the clinic template | Section did not become public content | Product publication |
| AC-WEB-09 | Draft preview uses the mint theme | Preview class is `gp-website-theme--ac-default` | Disabled gallery button was treated as applied. The draft theme id stayed `ac.default` | Apply the theme through the page API, then assert the preview |
| AC-REC-02 | Queue URL after check-in | Stayed on `/app/reception/walk-in` with "Something went wrong", reference `a36a8d0d9fb2c4788d424fbe` | Walk-in POST threw. Admin is not the receptionist the journey requires | Sign in as receptionist. Map foreign-key and check failures to a controlled result |
| AC-REC-03 | Heart rate control visible | Option exists but `toBeVisible` failed | `<option value="heart_rate">` is in the closed select. Playwright reports it hidden | Assert the option count, then save |

BlessBoard, `tests/e2e/v13/v13-bb-qa-regression.spec.js`:

| TEST_ID | ACTUAL | ROOT_CAUSE | CLASS |
| --- | --- | --- | --- |
| BB-01 create | Click timeout on `a[href*='/pages/']` | Website hub has no that link | Selector does not match the hub |
| BB-01 edit | Same click timeout | Same | Selector |
| BB-02 upload | Count assertion failed | Upload control or result count | Media stays disabled |
| BB-02 public | Announcement marker absent | Unpublished website setup page | Same gate as HTTP BB-ANN-01 |
| BB-03 event | Create control absent | Hub or content route does not expose the expected control | Navigation |
| BB-04 sermon | Create control absent | Same | Navigation |
| BB-06 activate | `E2E_BB_MEMBER_INVITE_TOKEN` required | No plaintext invitation was stored | Fixture secret absent. Do not invent one |
| BB-06 login | Fill timeout | Activation did not create the login | Depends on BB-06 |
| BB-24 contact | Contact control absent | Public contact route not the expected control | Navigation |
| BB-24 admin | Enquiry not visible | Contact was not stored | Depends on the public post |
| INV-01 accept | `E2E_BB_STAFF_INVITE_TOKEN` required | No plaintext staff invitation | Fixture secret absent |
| INV-01 sign-in | Status mismatch | Invitation was not accepted | Depends on INV-01 |
| BB-AUTH-04 | `E2E_BB_MEMBER_OTP` required | No plaintext OTP | Do not invent a code |
| BB-MEM-01 | Required field not visible | Form control the test seeks is absent on the rendered step | Form step |
| BB-MEM-02 | Status mismatch | CSRF result status was not the expected value | Do not weaken CSRF |
| BB-REG-07 | Stayed on `/register-church`, not `submitted=1` | Second registration did not reach the submitted URL | Registration result |
| BB-ANN-01 | Marker absent | Unpublished website | Same public-page gate |
| BB-WEB-08 | Theme control timeout | Gallery control not the expected node | Theme navigation |
| BB-WEB-09 | Sermon text not visible | Public or admin list did not show the title | Public-page gate or create |
| BB-WEB-10 | Event text not visible | Same | Same |
| BB-ANN-02 | Attachment text mismatch | Upload is disabled | Approved disabled media |

Passed and not in this table: ActiveClinic 15, including AC-REG-01, AC-PUB-01, G66, and G67. BlessBoard BB-05 and the D14C OTP gate staying blocked.

## Later reruns, not in the 43

| TEST_ID | RESULT | WHAT CHANGED |
| --- | --- | --- |
| AC-WEB-09 | Failed | Preview HTML contained `ac.default`, not the mint theme |
| AC-REC-02 | Failed | Unique patient was created. Check-in then showed the generic server error |
| AC-REC-03 | Failed | Vitals page rendered. Heart rate option existed and was not visible inside the closed select |

## Shared causes

1. Unpublished BlessBoard website returns the setup page, so sermon, event, and announcement markers are absent together.
2. Reused patient names `D05 Walker` and `D05 Vitals` trip duplicate review.
3. `platform.otp_challenges`, the appointment slot lock, and staff-overlap stay approved blockers.
4. Media upload 403 is the approved disabled state.
5. BlessBoard browser invitation and OTP tests stop because plaintext secrets were not retained.
