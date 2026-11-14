# Security and release blockers

No release claim follows from this stage. All 84 acceptance rows stay `NOT_RUN`.

| Blocker | Status | Why it remains |
|---|---|---|
| AC-05 live lower-privilege denial | `BLOCKED_SECURITY` | V2.12 blocker unchanged. Prepared browser request not executed. Cashier referral 403 is a different case. |
| Patient portal persistence | `EVIDENCE_MISSING` | Code exists. Prior pass artifact missing. D19 browser and integration bodies not executed. |
| Appointment concurrency | Partial staff overlap; capacity missing | Check-then-insert can admit two concurrent bookings. No capacity lock. Runner not executed. |
| OTP production | Held | `origin/V13` login does not require OTP. Worktree activation stays blocked. Migration and provider are not approved. Multi-worker replay is not proven. |
| G2 isolated database | Held | Write flags unset. `runGated` returns before opening a pool. |
| G3 browser | Held | Playwright not launched. 5 ActiveClinic and 14 BlessBoard tests are prepared only. |
| G4 provider, restore, SLOs | Held | Decisions D21-10 and D21-11 are unapproved. |
| Clinical specification completeness | Not a V2.12 defect rewrite | Merge, retention, scan quarantine, break-glass, offline recovery, and Juflona signing are missing or deferred. They block a specification-complete claim. |

Controls already present in source, and not converted to passes: merge permission assigned to nobody, portal not implied by patient creation, finance reversal not granted to cashier or billing officer, self-escalation denial, hashed verification codes when that service is used, and no BlessBoard SQL against ActiveClinic clinical tables.

The verification pepper fallback on `origin/V13` remains incompatible with a fail-closed production startup rule. It is not changed here.
