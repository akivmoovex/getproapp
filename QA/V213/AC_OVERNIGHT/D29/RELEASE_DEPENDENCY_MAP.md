# Release dependency map

```text
Phase 0 approvals
  -> A  AC-05 live denial, portal persistence, staff-overlap persistence
  -> A  OTP stays blocked until migration, provider, and durable store are approved together
  -> B  tenant denial, then C encounter decision
  -> C  -> D orders, results, pharmacy
  -> B  -> E billing evidence
  -> B  -> F documents and retention, only after legal periods
  -> G  restore and offline, only after RPO/RTO
  -> H  break-glass and Juflona stay deferred
```

Release gates that stay closed:

| Gate | Depends on | Current evidence |
|---|---|---|
| G1 | In-process tests | 233 passed later; 195 is the D22 historical record. Neither is an acceptance pass |
| G2 | Isolated database | Not run |
| G3 | Browser, including AC-05 | Not run |
| G4 | OTP provider | Not approved |
| Migration | Separate authorization | `048_otp_challenges.sql` does not exist and was not executed |
| Restore | D21-10 | No drill |

Portal registration and appointment create are inputs to A, not features to replace. A capacity lock, an OTP session gate, and a retention deleter each wait on their approval. Shipping any of them early would change behavior the specification says must be preserved or would invent a rule.

`SEC-01-02` blocks release by itself. OTP in-process tests do not remove that block.
