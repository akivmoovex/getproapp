# V13 G63 — hardening and functionality

The new engine refuses another organisation’s rule and does not fill a missing rule with a number. Result entry rolls back when a supplied rule is cross-tenant, conflicting, or invalid. Historical interpretation changes only when reassessment is explicitly authorized.

Dispense still checks the remainder and now rejects a repeated item before a transaction. The prescription form still says manual entry only. Public booking and the media flag were not enabled. OTP production delivery was not activated. Paper disposal and the new retention planners keep `deleted: false`. Appointment `STALE_VERSION` was not edited.

Requirement counts stay 16/7/6/1 and 13/3/1. AC-13, AC-12, AC-14, and AC-19 remain partial because thresholds are not configured, the queue handoff still needs a catalogue id, and migrations 043 and 044 are not applied. Media stays partial. The functionality documents under `docs/functional/` record these limits.

```
COUNTS_CHANGED=NO
SECURITY_CONTROLS_WEAKENED=NO
MIGRATIONS_EXECUTED=NO
```
