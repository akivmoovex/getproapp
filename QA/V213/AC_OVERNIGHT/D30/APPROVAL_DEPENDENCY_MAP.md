# Approval dependency map

```text
D21-15 AC-05 definition
  -> D21-01 role changes, if any
  -> D21-12 break-glass stays deferred

D21-14 portal evidence
  -> PAT-01-01 only. Does not change registration

D21-04 identifier rule
  -> D21-03 merge
  -> patient channel inside D21-11

D21-02 stored encounter states
  -> package C
  -> D21-06 critical path
  -> ACX-007 outbox events
  -> ACX-008 paths

D21-05 capacity
  -> APT-01-03 only. Staff overlap stays

D21-07 substitution
  -> D29-17 allergy review
  -> ACX-003

D21-09 legal periods
  -> package F disposal
  -> D29-16 does not grant a retention rule

D21-10 host and RPO/RTO
  -> D29-18 numbers
  -> ACX-006
  -> package G restore

D21-11 OTP hold
  -> ACX-005 delivery monitor
  -> no migration and no provider

D21-13 and D29-16
  -> package H signing, still deferred
  -> ACX-002 representatives
```

Recommended order that leaves current ActiveClinic behavior in place:

1. Package A evidence only: live AC-05, disposable-database portal activation, disposable-database staff overlap. Do not change register, login, or appointment create.
2. Leave D21-02, D21-05, and D21-11 on their pending defaults so encounters, booking, and login stay as they are.
3. Package B denials for facility and duplicate review. Do not add merge.
4. Package C and D only after D21-02, D21-06, and D21-07 are actually approved.
5. Package E evidence for the current finance-supervisor reversal. Do not move payments.
6. Package F and the ACX consent rows only after D29-16 and D21-09. No new table.
7. Package G restore, monitors, and SLOs only after D21-10 and D29-18 name the numbers.
8. Package H remains deferred with D21-12 and D21-13.

No step in that order is authorized by writing it down.
