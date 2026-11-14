# Feature dependency graph

Solid arrows are real dependencies. Nothing below the first row is approved.

```text
Existing contracts (bug fix only)
  -> AC-05 live evidence
  -> portal persistence evidence
  -> staff-overlap persistence evidence

D21-15 AC-05 definition
  -> D21-01 role edits
  -> D21-12 break-glass

D21-04 identifier rule
  -> D21-03 merge and unmerge
  -> patient OTP channel inside D21-11

D21-02 encounter states
  -> package C handoff
  -> D21-06 critical path
  -> order rollback
  -> ACX-007 outbox
  -> ACX-008 versioned paths

D21-05 capacity
  -> APT-01-03 only

D21-07 substitution
  -> D29-17 allergy review

D21-09 legal periods
  -> retention, hold, disposal
  -> scan quarantine stays with D29-16 for patient match

D21-10 host and RPO/RTO
  -> D29-18 numbers and monitors
  -> restore drill

D21-11 OTP hold
  -> migration 048, which does not exist
  -> a selected provider
  -> delivery monitors

D21-13 and D29-16
  -> Juflona signing
  -> representative identity
```

Partial features can stay as they are without these arrows. Missing and deferred features cannot start until the decision at the tail of their arrow is approved.

Package order that protects portal registration and appointment create: evidence for A, then B denials without merge, then C only after D21-02, then D and E, then F and G, with H last.
