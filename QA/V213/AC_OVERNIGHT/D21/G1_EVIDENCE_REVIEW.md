# D21 G1 evidence review

Fresh execution this stage: `NOT_RUN`. The V13 worktree is dirty, so the non-mutating G1 command was not repeated. The numbers below are the preserved D19 record, reviewed against the test source. They are not a new run.

## Preserved D19 baseline

| Label | Value | Meaning |
|---|---|---|
| Executed node tests | 184 | 173 Stage A tests plus 11 integration files entered by the runner |
| Passed assertions | 173 | Stage A unit, contract, HTTP, security, OTP, CSRF, and mutation probes |
| Failed | 0 | No failing assertion in that Stage A log |
| Not-run scenarios | 30 | 11 integration journeys plus 19 browser journeys |
| Skipped | 0 | Node TAP skipped count on the Stage A log |

`184` is not 184 passing tests. The 11-test gap is `184 - 173`.

## The 11-test difference

`runGated` in `tests/v13/integration/v13AuthorizedScenarios.js` calls `requireDbWriteAuthorization`. With both write flags unset, that helper returns false, prints `V13_RESULT=NOT_RUN`, and returns before `openPool`. The node test function then returns without throwing, so the runner records a pass for the gate check.

Each of these 11 files is one gate record. The journey inside was not executed and is not part of the 173 passes.

| File | Runner class | Node result | Journey |
|---|---|---|---|
| `bb01-homepage-sections.integration.test.js` | BlessBoard persistence | Gate record | `NOT_RUN` |
| `bb02-announcements.integration.test.js` | BlessBoard persistence | Gate record | `NOT_RUN` |
| `bb03-events.integration.test.js` | BlessBoard persistence | Gate record | `NOT_RUN` |
| `bb04-sermons.integration.test.js` | BlessBoard persistence | Gate record | `NOT_RUN` |
| `bb05-member-registration.integration.test.js` | BlessBoard persistence | Gate record | `NOT_RUN` |
| `bb06-member-activation.integration.test.js` | BlessBoard persistence | Gate record | `NOT_RUN` |
| `bb24-public-directory.integration.test.js` | BlessBoard persistence | Gate record | `NOT_RUN` |
| `inv01-staff-invitation.integration.test.js` | Staff invitation persistence | Gate record | `NOT_RUN` |
| `d14c-otp-auth.integration.test.js` | OTP persistence | Gate record | `NOT_RUN` |
| `d16-ac-auth.integration.test.js` | ActiveClinic role, patient, appointment | Gate record | `NOT_RUN` |
| `d16-platform-otp.integration.test.js` | OTP table and replay | Gate record | `NOT_RUN` |

D19’s implementation report states Stage A as 173 passed and 0 failed, integration discovery as 11 `NOT_RUN`, and 19 browser journeys not started. D20 reconciled the Stage A manifest to the same 173 literal tests. This stage did not re-count or re-run that suite.

## Topic evidence

| Topic | What exists | What was executed |
|---|---|---|
| Unit, contract, HTTP, security, OTP policy | Stage A files in the dirty worktree | D19 historical 173. Not re-run here. |
| Tenant isolation | Source checks and contract tests | No live cross-tenant denial in D19 or D21 |
| Patient identity | Patient and duplicate services on `origin/V13` | No database persistence run |
| Portal activation | Registration service on `origin/V13`; browser test prepared | Persistence `NOT_RUN`. Prior V2.12 pass artifact still missing |
| Appointment conflict | Staff-overlap check on `origin/V13`; `runAcAuth` prepared | Persistence `NOT_RUN`. Capacity lock is not in that code |
| Browser | 5 ActiveClinic and 14 BlessBoard tests prepared | Not launched. Held |

Uncommitted OTP session tags and the OTP module are worktree files. They are not on `origin/V13`, and their acceptance rows were not executed. They do not change the D19 totals or the 84-case classes.
