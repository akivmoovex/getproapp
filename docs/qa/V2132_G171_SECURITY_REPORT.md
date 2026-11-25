# G171 security report

Re-executed in both full cycles on synthetic identities.

| Boundary | Result |
| --- | --- |
| CSRF | BlessBoard member create rejects a missing token. Consultation and prescription forms post the shell token. |
| Authentication | Logout returns ActiveClinic and BlessBoard protected pages to login. |
| Role | Clinic administrator can start an encounter and cannot edit the note. Clinician can. Receptionist is denied worklist, documents, pharmacy, laboratory, and billing. |
| Clinic isolation | Clinic B administrator does not see the new complaint and a post does not change the draft row. Wrong-clinic portal activation stays denied. |
| Church isolation | Sermons, events, and announcements stay off the other church. |
| Cross-product themes | Church theme rejected on a clinic. Clinic theme rejected on a church. |
| AC-05 | Signed-in lower-privilege user receives 403 or 404 on the test-database GET routes. The management title is absent. There is no POST mutation route on that path. |
| Invitation replay | Still denied. |
| Vitals | Original 72 bpm remains after the 80 bpm correction. A stranger post does not add 140 bpm. |
| Appointment concurrency | Two clients, one winning row, retry rejected, other staff independent. Both HTTP runs. |
| OTP replay | Cannot be executed. The challenge table is absent. The failing tests were not skipped. |
| Website publish | Draft text is absent on the public page until publish. |

No security guard was weakened.
