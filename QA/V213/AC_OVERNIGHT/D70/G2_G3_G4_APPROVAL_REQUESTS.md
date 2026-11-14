# G2, G3, and G4 approval requests

None of these was granted. A later run may start only when the condition is already true. Do not turn the flags on inside the run.

| Request | Why it is still open |
|---|---|
| Both database write flags, testing identity, a run id, and a local run-owned database | `applyActiveClinicFixtures` throws `V13_FIXTURE_HOLD`. No URL is set |
| `GETPRO_V13_BROWSER_AUTHORIZED=1` and a guarded `E2E_DATABASE_URL` | The browser spec throws `NOT_RUN` |
| AC-05 rows for the platform administrator and the tenant reader | The plan is `persisted: false`. Live denial was not run |
| Stored portal activation and a stored appointment collision | Both are `NOT_RUN`. The provisioner does not use the `v13d19` clinic keys |
| D21-05 before any capacity lock | Capacity is null. The gated test throws if the gate opens |
| An approved OTP migration and provider | Production delivery stays off. `1234` is testing-only. Do not create `048_otp_challenges.sql` |
| A G4 definition | No job exists, so there is nothing to hold or dispatch |

Eighteen design decisions remain pending: D21-01 through D21-15, D29-16, D29-17, and D29-18. Do not approve a merge, a retention period, an allergy block, a substitution, or a service-level number.
