# Missing runtime capabilities

These are absent. They are not approved to build.

| Capability | Decision | Schema |
|---|---|---|
| Slot capacity and a lock around the overlap check | D21-05 | No `slot_capacity` column is authorized |
| Critical-result escalation | D21-06 | No result column is authorized on the alert |
| OTP provider and `platform.otp_challenges` | D21-11 | The migration is not authorized |
| Merge and unmerge | D21-03 | No table is named |
| Retention, legal hold, disposal | D21-09 | No period and no deleter |
| Restore, RPO, RTO | D21-10 | No number |
| Offline writer | Not approved | The route stays 503 |
| Accessibility and monitoring | D29-18 | No exporter |
| Representatives | D29-16 | No representative field |
| Allergy review before dispense | D29-17 | No blocker |
| Transactional outbox | D21-02 | No table |
| Versioned clinical API | D21-02 | No path |
| Juflona signing | D21-13 | Stays off |
| Break-glass | D21-12 | Stays absent |
| One-time booking lookup token | Not decided | The token stays reusable |

Eighteen decisions, D21-01 through D21-15 plus D29-16, D29-17, and D29-18, are still pending. None was approved here.
