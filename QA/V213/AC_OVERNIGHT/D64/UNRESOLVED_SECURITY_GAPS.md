# Unresolved security gaps

| Gap | Why it remains |
|---|---|
| AC-05 live denial | No signed-in lower-privilege session was opened. `SEC-01-02` stays blocked |
| Portal persistence | No identity or patient link was stored |
| Appointment overlap under two connections | The check is still outside the insert transaction. Capacity is unapproved, so no lock was added |
| Payment duplicate return | The behavioral test still returns before that branch |
| Booking lookup token | It stays reusable. No decision says to consume it |
| OTP production | Memory store. Delivery stays off |

These need a disposable database or an open design decision. They were not treated as approved code changes.
