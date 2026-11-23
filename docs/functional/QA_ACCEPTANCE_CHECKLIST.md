# QA acceptance checklist

QA decision for this handoff is NO-GO. Safe tests passed. HTTP left 4 blocked failures. Playwright left 23 failures. Do not treat this build as ready for release.

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
