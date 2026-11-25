# QA acceptance checklist

QA decision for the G210 handoff is NO-GO. Community Benefits is implemented in source and is not release-complete. Two safe runs each executed 591, passed 589, failed 0, and skipped 2. Two HTTP runs each executed 36, passed 33, and failed 3: D14C, D16 platform OTP, and D25 slot capacity. Same-staff overlap passed. Two Playwright cycles each passed ActiveClinic 30 and BlessBoard 23. Community browser evidence is mock-backed, 7 passed, and is not PostgreSQL end to end. The disposable community-schema check returned `BLOCKED_BY_MIGRATION` and created nothing. Financial posting stays disabled. The evidence is `docs/qa/community-benefits/G210_FINAL_HANDOFF.md`.

QA decision for the G188 handoff is NO-GO. Two safe runs each executed 582, passed 580, failed 0, and skipped 2. Two HTTP runs each executed 36, passed 33, and failed 3: D14C, D16 platform OTP, and D25 slot capacity. Same-staff overlap passed. One Playwright cycle passed ActiveClinic 30 and BlessBoard 23. The shared OTP store is covered by database-free tests. The PostgreSQL persistence body was not executed. Production OTP stays disabled. The evidence is `docs/qa/V2132_G188_OTP_ARCHITECTURE_HANDOFF.md`.

QA decision for the G180 handoff is NO-GO. Two safe runs each executed 573, passed 571, failed 0, and skipped 2. Two HTTP runs each executed 36, passed 33, and failed 3: D14C, D16 platform OTP, and D25 slot capacity. Same-staff overlap passed in both HTTP runs. Two Playwright cycles each passed ActiveClinic 30 and BlessBoard 23. Stocked synthetic dispensing passed in HTTP and in the browser, including one stock movement and a rejected second-facility batch. The evidence is `docs/qa/V2132_G180_FINAL_QA_HANDOFF.md`.

QA decision for the G175 handoff is NO-GO. Two safe runs each executed 572, passed 570, failed 0, and skipped 2. Two HTTP runs each executed 35, passed 32, and failed 3: D14C, D16 platform OTP, and D25 slot capacity. Same-staff overlap passed in both HTTP runs. Two Playwright cycles each passed ActiveClinic 29 and BlessBoard 23. The evidence is `docs/qa/V2132_G175_FINAL_QA_HANDOFF.md`.

QA decision for the G165 handoff was NO-GO. Two safe runs each executed 572, passed 570, failed 0, and skipped 2. Two HTTP runs each executed 35, passed 32, and failed 3: D14C, D16 platform OTP, and D25 slot capacity. Same-staff overlap passed in both HTTP runs. Two Playwright cycles each passed ActiveClinic 28 and BlessBoard 23. The evidence is `docs/qa/V2132_G165_EXHAUSTIVE_QA_HANDOFF.md`.

QA decision for the G146 handoff was NO-GO. Two safe runs each passed 569 of 571, with 2 skipped. Two HTTP runs each executed 35, passed 32, and failed 3: D14C, D16 platform OTP, and D25 slot capacity. Same-staff overlap passed. Two Playwright cycles each passed 49 of 49, ActiveClinic 26 and BlessBoard 23. The execution sheet is `docs/qa/V2132_G143_QA_EXECUTION_GUIDE.md`.

Known open items, which are not resolved bugs:

1. Production OTP is disabled.
2. Patient OTP recovery is not release-ready.
3. D25 slot-capacity policy remains unapproved.
4. Public self-registration is not an approved feature.
5. Public appointment booking remains disabled.
6. Production binary media upload remains disabled.
7. Hosting may still have an older commit until separately deployed.
8. Resend domain setup does not prove OTP delivery.

QA decision for the G141 handoff was NO-GO. Safe tests passed 567 with 2 skipped, of 569. Two HTTP runs each executed 35, passed 32, and failed the same three gates. Two Playwright cycles each passed 49 of 49. Do not treat this build as ready for release while the OTP and slot-capacity HTTP gates fail.

QA decision for the G120 handoff was NO-GO. Safe tests passed 529 with 2 skipped. Two HTTP runs each left the same 4 blocked failures. Two Playwright runs each passed 43 of 43. Do not treat this build as ready for release while the OTP and appointment HTTP gates fail.

A box may be checked only after an authorized run. Nothing below was executed in G37–G44. G82 executed the checked rows on `getpro_v13_e2e_g78d2301` at `127.0.0.1:55432`. `NOT_RUN` is not a pass. A failed assertion stays unchecked.

## ActiveClinic

- [ ] Register a patient and find that patient in the same organisation
- [ ] Confirm a duplicate candidate is not merged
- [ ] Start an encounter and see it on the clinical list
- [ ] Check in a walk-in at a service point in that facility
- [x] Record a vital as clinical staff and confirm an anonymous session is sent to login and another clinic is denied (G88 AC-REC-03)
- [ ] Sign a consultation and confirm it cannot be overwritten
- [ ] Sign a consultation and confirm it cannot be overwritten
- [ ] Order a laboratory test with urgency routine, urgent, or stat
- [ ] Confirm an unknown urgency is rejected and no reference range is invented
- [ ] Enter a manual prescription with dose, frequency, and duration
- [x] Confirm a prescription without a catalogue id says it is not on the pharmacy queue (G82 browser G67)
- [x] Preview a laboratory reference rule and confirm nothing is saved (G82 browser G66)
- [ ] Dispense no more than the remaining quantity
- [ ] Invoice in minor units and refuse a second reversal
- [ ] Close the encounter once and get `STALE_VERSION` on a stale retry
- [ ] Retrieve the text document and confirm a receptionist is denied
- [ ] Confirm `/app/offline` is 503 and writes nothing
- [x] Confirm public booking stays unavailable and has no coupon (G82 browser AC-PUB-01; HTTP text assertion failed and stays open)

## BlessBoard

- [ ] Register a church and reject a mismatched duplicate phone
- [ ] Add a member with address, marital status, and kin phone
- [ ] Confirm one CSRF token and a 403 when it is missing
- [ ] Confirm create does not activate the portal
- [ ] Save a sermon with `preachedAt` and an event with `startsAt`
- [ ] Publish an announcement to the public audience and open its id
- [x] Confirm an upload is refused while the media flag is unset (G88 HTTP 403 `media_uploads_disabled`)
- [ ] Confirm a section is not written without its church id
- [ ] Confirm another product’s theme is rejected

## Shared

- [ ] OTP replay fails and no production message is sent
- [ ] Export and restore are still not claimed
- [x] Migration 043 and 044 are applied only on `getpro_v13_e2e_g78d2301`. Hosted QA and production were not migrated
- [x] Isolated host used for G82 was `127.0.0.1` port `55432`. Port `5432` and `getpro_v13_e2e_regression213101` were not used

Gated files and the required flags are listed in [../qa/V13_G36_ISOLATED_TEST_READINESS.md](../qa/V13_G36_ISOLATED_TEST_READINESS.md).
