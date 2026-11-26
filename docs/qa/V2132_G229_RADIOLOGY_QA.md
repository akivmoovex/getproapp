# G229 radiology QA

The source supports radiology request creation, queue loading, report entry,
verification, release and critical-result handling. Stored request statuses
are `pending`, `in_progress`, `completed`, `verified`, `released`, `rejected`,
and `cancelled` where applicable. The G224 filter repair adds an explicit
`completed` queue and counter without treating it as verified.

The full order → report → verify → clinician read-back journey is not yet
covered by an executed PostgreSQL/browser test equivalent to the laboratory
journey. This is an incomplete P1 coverage gap, not a fabricated PASS.
Wrong-clinic and permission middleware are covered by the existing route and
security contracts, but a synthetic persisted radiology journey is the next
safe action.
