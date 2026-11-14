# Feature implementation roadmap

This is the order already supported by D21 through D27. It is not permission to write code.

1. Keep the release gates closed. AC-05 still needs a live lower-privilege denial.
2. Decide the encounter states before queue, nursing, or order handoff work. Stored states remain `open`, `completed`, and `cancelled`.
3. Decide note amendments. The table exists. No service writes it. Signed notes already refuse an in-place edit.
4. Point critical-result acknowledgement at the supplied result. The current query takes the newest active alert.
5. Leave pharmacy substitution and payment reversal as they are until the owners confirm them. Reversal is on the finance supervisor catalogue, not the cashier list.
6. Leave document scan, quarantine, and retention unimplemented.
7. Leave `activeclinic.patient.merge` assigned to nobody.
8. Add slot capacity only after a capacity rule exists. Public booking idempotency is retry deduplication, not a lock.
9. Add a durable OTP store, a selected provider, and a release check together. Do not add a production `1234` bypass.

Existing behavior that is wrong relative to its own path, separate from missing features:

- `acknowledgeCriticalResult` does not filter the alert by the result id.
- Appointment overlap is checked before `BEGIN`, with no row lock.
- A valid booking access token stays valid after `verifyBookingAccessToken` updates `last_used_at`.
- Public patient registration returns distinct match errors. Login uses one generic failure.

BlessBoard repairs from D03 through D13 are already in the dirty product tree. They are not part of this clinical backlog, and they are not in the QA-only file list.
