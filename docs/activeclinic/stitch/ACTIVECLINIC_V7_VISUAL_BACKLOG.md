# ActiveClinic V7 — Visual Backlog

**Generated:** 2026-08-12T10:31:44.770Z
**Rows:** 361 (full implementation mappings only)

## Score buckets

| Band | Count |
|---|---:|
| <80 | 0 |
| 80–89 | 149 |
| 90–94 | 119 |
| ≥95 | 0 |
| Unscored | 93 |

## Priority sort

1. P0 + score <80
2. P0 + 80–89
3. P1 + score <90
4. remaining

## Top 25 visual gaps

1. **P27 - Juflona Patient - Portal Offline State - Mobile** (MOBILE) — score 82 — `/clinics/:clinicKey/patient/offline` — Pass2: offline state template
2. **P27 - Juflona Patient - Set New Password - Desktop** (DESKTOP) — score 82 — `/clinics/:clinicKey/patient/reset-password` — Pass2: reset password form shell
3. **P02 – Edit Patient Details – Desktop** (DESKTOP) — score 84 — `/app/patients/:patientNumber/edit` — Pass3: shared form tokens; TEST_INFRA_LIMITATION: no browser MATCHED
4. **P02 – Patient List – Mobile** (MOBILE) — score 84 — `/app/patients` — Large visual/layout gap vs Stitch
5. **P02 – Patient Registration Success – Mobile** (MOBILE) — score 84 — `/app/patients` — Large visual/layout gap vs Stitch
6. **P02 – Register Patient Contact – Desktop** (DESKTOP) — score 84 — `/app/patients/new` — Pass3: form-section tokens; PhoneField preserved; TEST_INFRA_LIMITATION: no browser MATCHED
7. **P02 – Register Patient Emergency and Medical – Desktop** (DESKTOP) — score 84 — `/app/patients/new` — Pass3: form-section tokens; PhoneField preserved; TEST_INFRA_LIMITATION: no browser MATCHED
8. **P02 – Register Patient Identity – Desktop** (DESKTOP) — score 84 — `/app/patients/new` — Pass3: form-section tokens; PhoneField preserved; TEST_INFRA_LIMITATION: no browser MATCHED
9. **P02 – Register Patient Review – Desktop** (DESKTOP) — score 84 — `/app/patients/new` — Pass3: form-section tokens; PhoneField preserved; TEST_INFRA_LIMITATION: no browser MATCHED
10. **P07 – Patient Invoice – Mobile** (MOBILE) — score 84 — `/app/billing/invoices/:invoiceId` — Large visual/layout gap vs Stitch
11. **P07 – Service Catalogue – Mobile** (MOBILE) — score 84 — `/app/billing/catalog` — Large visual/layout gap vs Stitch
12. **P25 - Juflona Booking - Choose Procedure - Desktop** (DESKTOP) — score 84 — `/clinics/:clinicKey/book/procedures` — Pass2: reuses choice-card system
13. **P25 - Juflona Booking - Procedure Review - Desktop** (DESKTOP) — score 84 — `/clinics/:clinicKey/book/procedures/:procedureKey/review` — Pass2: review embedded in single-page procedure flow
14. **P26 - Juflona Booking - Privacy and Lookup Rules - Desktop** (DESKTOP) — score 84 — `/clinics/:clinicKey/my-booking` — Pass2: lookup privacy copy retained
15. **P27 - Juflona Patient - Password Updated - Mobile** (MOBILE) — score 84 — `/clinics/:clinicKey/patient/password-updated` — Pass2: success shell if present
16. **P27 - Juflona Patient - Recovery Verification - Mobile** (MOBILE) — score 84 — `/clinics/:clinicKey/patient/recovery-verification` — Pass2: recovery honesty page shell
17. **P27 - Juflona Patient - Set New Password - Mobile** (MOBILE) — score 84 — `/clinics/:clinicKey/patient/reset-password` — Pass2: reset password form shell
18. **P27 - Juflona Patient - Verification Success - Mobile** (MOBILE) — score 84 — `/clinics/:clinicKey/patient/verification-success` — Pass2: success shell if present
19. **P24 - Juflona Booking - Availability States - Mobile** (MOBILE) — score 85 — `/clinics/:clinicKey/book/slot` — Pass2: no_slots_published banner; live grids not implemented
20. **P25 - Juflona Booking - Procedure Unavailable - Mobile** (MOBILE) — score 85 — `/clinics/:clinicKey/book/procedures/:procedureKey` — Pass2: unavailable state page exists
21. **P25 - Juflona Booking - Resource Availability States - Mobile** (MOBILE) — score 85 — `/clinics/:clinicKey/book/procedures/:procedureKey/time` — Large visual/layout gap vs Stitch
22. **P02 – Register Patient Contact – Mobile** (MOBILE) — score 86 — `/app/patients/new` — Pass3: form-section tokens; PhoneField preserved; TEST_INFRA_LIMITATION: no browser MATCHED
23. **P02 – Register Patient Emergency and Medical – Mobile** (MOBILE) — score 86 — `/app/patients/new` — Pass3: form-section tokens; PhoneField preserved; TEST_INFRA_LIMITATION: no browser MATCHED
24. **P07 – Cashier Closing – Desktop** (DESKTOP) — score 86 — `/app/cashier/close/review` — Pass3: shared shell/components; TEST_INFRA_LIMITATION: no browser MATCHED
25. **P07 – Cashier Dashboard – Desktop** (DESKTOP) — score 86 — `/app/cashier` — Pass3: shared shell/components; TEST_INFRA_LIMITATION: no browser MATCHED
