# V2132 G258 coverage audit

Adversarial checks applied to tip evidence:

| Question | Answer |
| --- | --- |
| Pass if nothing persisted? | No for lab/rad/OTP PG/community PG |
| Pass for wrong patient/clinic? | Negative isolation tests exist |
| Pass if unpublished? | Website draft privacy covered |
| Pass unauthorized? | Role denial covered |
| Pass if concurrent both win? | OTP completion + appointment overlap covered |
| Pass via fake OTP in production? | Forbidden |
| Pass via mock only as PG? | Community mock browser separately labeled |
| Pass if financial posted? | Posting hard-disabled |

Remaining gaps: live Resend mailbox (P0 external), hosted print visual (P1), SOAP field matrix depth (P1), D25 capacity policy.
