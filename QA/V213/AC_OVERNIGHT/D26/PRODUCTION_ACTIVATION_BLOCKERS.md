# Production activation blockers

Production OTP is not approved.

| Blocker | State |
|---|---|
| Activation | `BLOCKED` even if the override is `ACTIVE` on a production environment |
| Migration | `048_otp_challenges.sql` does not exist and was not executed |
| Durable store | Memory only. A second store cannot see the first challenge |
| Provider | None selected. Delivery activation is refused |
| Testing code | `1234` works only inside the verified testing identity. Production startup rejects the fixed-code flag |
| Release check | `release_not_verified` remains a block reason |
| Login while blocked | Existing password login still proceeds. That must not be described as OTP enforcement |
| Audit | In-memory audit omitted the codes under test. A durable audit path was not run |

Do not add a production bypass. Do not create the migration file until the store, provider, and release checks are approved together.
