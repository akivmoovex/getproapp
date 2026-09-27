# V2.03 QA — End-to-End Business Journeys (QA11)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_END_TO_END_JOURNEYS` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisite** | QA06–QA10 · [V2_03_TEST_COVERAGE_MATRIX](./V2_03_TEST_COVERAGE_MATRIX.md) |
| **Mode** | MAP existing HTTP/service E2E + ADD service-layer journey suite |
| **Harness** | `node:test` + foundation ephemeral Postgres (no new browser tooling) |
| **Verdict** | **`V203_END_TO_END_JOURNEY_PASS`** |

---

## Journeys covered

| Journey | Suite evidence | Denied paths |
|---------|----------------|--------------|
| BB register → configure website → upload media → publish → public | `tests/v203-end-to-end-journeys.test.js` (+ HTTP: `v7-local-registration-to-website-e2e`) | Cross-tenant media; cross-tenant publish |
| BB admin → invite/assign staff → access/scope | Same (+ `blessboard-staff-invitation`, `blessboard-rbac-e2e`) | Cross-tenant tenant authz; platform-admin escalation invite |
| AC register → facility/departments → invite staff | Same (+ `activeclinic-staff-invitation`) | Cashier cannot invite staff |
| AC patient → appointment → clinical → visit release | Same (+ `activeclinic-batch3-acp05-visit-summary`) | Cross-facility vitals; cross-patient summary read |
| AC website edit → media → publish → public | Same (+ `v10-pc10b-ac-website-workflow-baseline`) | Cross-tenant draft; editor-only publish forbidden |

---

## Complementary inventory (must remain present)

- `tests/v7-local-registration-to-website-e2e.test.js`
- `tests/blessboard-staff-invitation.test.js`
- `tests/activeclinic-staff-invitation.test.js`
- `tests/v10-pc10b-ac-website-workflow-baseline.test.js`
- `tests/v7-blessboard-publish-engine-bridge.test.js`
- `tests/activeclinic-batch3-acp05-visit-summary.test.js`
- `tests/blessboard-rbac-e2e.test.js`

---

## Added this pass

- `tests/v203-end-to-end-journeys.test.js`
- `npm run test:v203:e2e-journeys`
- Critical coverage pack includes the QA11 journey file

---

## Verification

```text
npm run test:v203:e2e-journeys
→ 7 pass / 0 fail
V203_END_TO_END_JOURNEY_PASS
```

---

## Marker

```text
V203_END_TO_END_JOURNEY_PASS
```
