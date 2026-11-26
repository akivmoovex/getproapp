# G221 settlement readiness

Settlement execution and funds movement stay blocked. This cycle adds a preview batch only.

## Preparation

`planSettlementBatch` requires a batch key, a clinic, and a reception or clinic-admin actor for that clinic. It is serialized on the batch key. A repeated key returns the existing batch and does not create a second row. The batch copies the plan ids and the agreement id and version already stored on each plan. Totals are integer ngwee and include refund lines, so a matching refund reconciles the contribution to zero. Status is always `PENDING_APPROVAL`. `posted` is false. An audit event `settlement.planned` is written. The ledger is not appended.

`commitSettlement` checks `financialPostingEnabled()`, which returns false. It audits `settlement.refused` and returns `posting_disabled`. No receivable or payable is posted.

`createAgreement` still forces status `INACTIVE` and legal approval `unapproved`. There is no activation route. Unit fixtures that need eligible math set both fields on the in-memory row and label that fixture synthetic.

The check-in action `settlement` plans `clinic:<clinicId>` and then calls `commitSettlement`. The page shows `PENDING_APPROVAL` and `No settlement is posted.`

## Not done

No money moves. No agreement becomes active. A live settlement is not fabricated. Full execution remains `BLOCKED_BY_POLICY` until commercial and legal approval exists.
