# V2.08 Overnight QA Handoff

```text
VERSION=2.08
BRANCH=V8
HEAD_SHA=6c31382a364f02ce6ba95220d7c93e7515344e97
ORIGIN_V8_SHA=6c31382a364f02ce6ba95220d7c93e7515344e97
QA_TOTAL=22
FIXED_VERIFIED=none in overnight batches
ALREADY_FIXED=AC-05,AC-06,AC-07,AC-08,AC-09,AC-10,AC-11,AC-12,BB-03,BB-04,BB-05,BB-08,BB-10
NOT_REPRODUCED=none
BLOCKED=AC-01,AC-02,AC-03,AC-04,BB-02,BB-06,BB-07
REQUIREMENT_DECISION=BB-01,BB-09
OPEN=none
```

## Verification limits

The focused Node suites repeatedly stalled during cold import or harness
initialization before producing pass/fail output. Browser/device picker tests,
database-backed final-flow tests, cross-tenant denial tests, and real email
delivery were therefore not claimed. Mock/testing delivery was the only
acceptable notification path. Migration compatibility was reviewed through
existing V8 history and contracts; no migration was run.

Existing V8 commits documenting prior fixes include:

- `3287b52a`, `62f60f7c`, `10ddb165` — identity, recovery, and invitation flows
- `9a0c3045`, `0c873840`, `c5ce63fc` — contact, inquiry, and booking flows
- `bb1ab5e9`, `9197741a` — clinic directory navigation
- `9b380a7d` — guest booking linkage
- `e34e2538` — shared media handling
- `907183f7`, `2c404be1`, `c918d526` — service-time management/publication
- `0ca8ec5e`, `debcefff` — shared website publication/versioning

## Remaining manual QA and release blockers

Run the blocked authenticated/mobile/browser suites with a healthy local
database and browser harness. Verify native gallery selection at widths 390,
374, and 360; execute BB/AC cross-tenant denial; and obtain a product decision
for plan-derived branch capacity and prayer-request requirements. These are
release blockers for a fully verified V2.08 gate. No production mutation or
merge to `main` occurred.
