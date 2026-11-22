# QA acceptance checklist

A box may be checked only after an authorized run. Nothing below was executed in G37–G44. `NOT_RUN` is not a pass.

## ActiveClinic

- [ ] Register a patient and find that patient in the same organisation
- [ ] Confirm a duplicate candidate is not merged
- [ ] Start an encounter and see it on the clinical list
- [ ] Check in a walk-in at a service point in that facility
- [ ] Record a vital as a nurse and confirm a receptionist cannot
- [ ] Sign a consultation and confirm it cannot be overwritten
- [ ] Order a laboratory test with urgency routine, urgent, or stat
- [ ] Confirm an unknown urgency is rejected and no reference range is invented
- [ ] Enter a manual prescription with dose, frequency, and duration
- [ ] Confirm a prescription without a catalogue id says it is not on the pharmacy queue
- [ ] Preview a laboratory reference rule and confirm nothing is saved
- [ ] Dispense no more than the remaining quantity
- [ ] Invoice in minor units and refuse a second reversal
- [ ] Close the encounter once and get `STALE_VERSION` on a stale retry
- [ ] Retrieve the text document and confirm a receptionist is denied
- [ ] Confirm `/app/offline` is 503 and writes nothing
- [ ] Confirm public booking stays unavailable and has no coupon

## BlessBoard

- [ ] Register a church and reject a mismatched duplicate phone
- [ ] Add a member with address, marital status, and kin phone
- [ ] Confirm one CSRF token and a 403 when it is missing
- [ ] Confirm create does not activate the portal
- [ ] Save a sermon with `preachedAt` and an event with `startsAt`
- [ ] Publish an announcement to the public audience and open its id
- [ ] Confirm an upload is refused while the media flag is unset
- [ ] Confirm a section is not written without its church id
- [ ] Confirm another product’s theme is rejected

## Shared

- [ ] OTP replay fails and no production message is sent
- [ ] Export and restore are still not claimed
- [ ] Migration 043 is still not applied
- [ ] Isolated host is `127.0.0.1` port `55432`, never port `5432`

Gated files and the required flags are listed in [../qa/V13_G36_ISOLATED_TEST_READINESS.md](../qa/V13_G36_ISOLATED_TEST_READINESS.md).
