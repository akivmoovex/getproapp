# ActiveClinic V7 — Visual Backlog

**Generated:** 2026-08-12T10:45:19.266Z
**Rows:** 361 (full implementation mappings only)

## Phase 7A

- P0 <90 before: 73
- P0 <90 after: 0
- Screens improved: 73

## Score buckets

| Band | Count |
|---|---:|
| <80 | 0 |
| 80–89 | 76 |
| 90–94 | 192 |
| ≥95 | 0 |
| Unscored | 93 |

## Priority sort

1. P0 + score <80
2. P0 + 80–89
3. P1 + score <90
4. remaining

## Top 25 visual gaps

1. **P04 – Consultation Workspace – Desktop** (DESKTOP) — score 82 — `/app/clinical/encounter/:encounterId` — Pass3: shared tokens only; TEST_INFRA_LIMITATION: no browser MATCHED
2. **P04 – Triage Assessment – Desktop** (DESKTOP) — score 82 — `/app/clinical/encounter/:encounterId/triage` — Pass3: shared tokens only; TEST_INFRA_LIMITATION: no browser MATCHED
3. **P04 – Vital Signs Entry – Desktop** (DESKTOP) — score 82 — `/app/clinical/encounter/:encounterId/vitals` — Pass3: shared tokens only; TEST_INFRA_LIMITATION: no browser MATCHED
4. **P03 – Create Walk-In Visit – Desktop** (DESKTOP) — score 84 — `/app/reception/walk-in` — Pass3: shared form/shell; TEST_INFRA_LIMITATION: no browser MATCHED
5. **P03 – Patient Check-In – Desktop** (DESKTOP) — score 84 — `/app/reception/check-in` — Pass3: shared form/shell; TEST_INFRA_LIMITATION: no browser MATCHED
6. **P04 – Clinical Escalation Alert** (DESKTOP) — score 84 — `/app/clinical/alerts` — Pass3: queue mobile cards + empty state; clinical logic untouched; TEST_INFRA_LIMITATION: no browser MATCHED
7. **P04 – Clinical Queue – Desktop** (DESKTOP) — score 84 — `/app/clinical` — Pass3: queue mobile cards + empty state; clinical logic untouched; TEST_INFRA_LIMITATION: no browser MATCHED
8. **P06 – Enter Laboratory Result – Desktop** (DESKTOP) — score 84 — `/app/diagnostics/laboratory/request/:requestId/result` — Pass3: shared shell/components; TEST_INFRA_LIMITATION: no browser MATCHED
9. **P06 – Enter Radiology Report – Desktop** (DESKTOP) — score 84 — `/app/diagnostics/radiology/request/:requestId/report` — Pass3: shared shell/components; TEST_INFRA_LIMITATION: no browser MATCHED
10. **P06 – Laboratory Dashboard – Desktop** (DESKTOP) — score 84 — `/app/diagnostics/laboratory` — Pass3: shared shell/components; TEST_INFRA_LIMITATION: no browser MATCHED
11. **P06 – Laboratory Request Detail – Desktop** (DESKTOP) — score 84 — `/app/diagnostics/laboratory/request/:requestId` — Pass3: shared shell/components; TEST_INFRA_LIMITATION: no browser MATCHED
12. **P06 – Laboratory Request Queue – Desktop** (DESKTOP) — score 84 — `/app/diagnostics/laboratory/queue` — Pass3: shared shell/components; TEST_INFRA_LIMITATION: no browser MATCHED
13. **P06 – Laboratory Worklist – Desktop** (DESKTOP) — score 84 — `/app/diagnostics/laboratory/worklist` — Pass3: shared shell/components; TEST_INFRA_LIMITATION: no browser MATCHED
14. **P06 – Radiology Dashboard – Desktop** (DESKTOP) — score 84 — `/app/diagnostics/radiology` — Pass3: shared shell/components; TEST_INFRA_LIMITATION: no browser MATCHED
15. **P06 – Radiology Request Queue – Desktop** (DESKTOP) — score 84 — `/app/diagnostics/radiology/queue` — Pass3: shared shell/components; TEST_INFRA_LIMITATION: no browser MATCHED
16. **P13 – Add Staff Member – Desktop** (DESKTOP) — score 84 — `/app/staff/new` — Pass3: shared shell tokens; TEST_INFRA_LIMITATION: no browser MATCHED
17. **P13 – Invite Staff Member – Desktop** (DESKTOP) — score 84 — `/app/staff/invite` — Pass3: shared shell tokens; TEST_INFRA_LIMITATION: no browser MATCHED
18. **P13 – Staff Access Dashboard – Desktop** (DESKTOP) — score 84 — `/app/access` — Pass3: shared shell tokens; TEST_INFRA_LIMITATION: no browser MATCHED
19. **P13 – Staff Account Activation** (MOBILE) — score 84 — `/activate/:token` — Pass3: shared shell tokens; TEST_INFRA_LIMITATION: no browser MATCHED
20. **P13 – Staff Directory – Desktop** (DESKTOP) — score 84 — `/app/staff` — Pass3: shared shell tokens; TEST_INFRA_LIMITATION: no browser MATCHED
21. **P13 – Staff Profile – Desktop** (DESKTOP) — score 84 — `/app/staff/:staffId` — Pass3: shared shell tokens; TEST_INFRA_LIMITATION: no browser MATCHED
22. **P13 – Suspend Staff Account** (DESKTOP) — score 84 — `/app/staff/:staffId/suspend` — Pass3: shared shell tokens; TEST_INFRA_LIMITATION: no browser MATCHED
23. **P04 – Consultation Workspace – Mobile** (MOBILE) — score 85 — `/app/clinical/encounter/:encounterId` — Pass3: shared tokens only; TEST_INFRA_LIMITATION: no browser MATCHED
24. **P05 – Prescription Clinical Review – Mobile** (MOBILE) — score 85 — `/app/pharmacy/prescriptions/:id` — Large visual/layout gap vs Stitch
25. **P03 – Appointment Calendar – Desktop** (DESKTOP) — score 86 — `/app/appointments/calendar` — Pass3: shared table/filter/status system; TEST_INFRA_LIMITATION: no browser MATCHED
