# G218 finance and policy decisions

These decisions are unresolved. The source does not assume an answer.

## Commercial

The commercial meaning of 10% is not approved. The calculator tests use 1000 basis points only as a synthetic input.

Model A at K1,000 produces a K100 patient discount and K900 payable. Model B produces no patient discount and a K100 contribution. Model C uses the rates stored on that agreement. None of these figures is an active clinic policy.

`createAgreement` stores `INACTIVE` and `unapproved`. Eligibility requires both `ACTIVE` and `approved`. There is no activation function.

## Posting

`financialPostingEnabled()` returns false. `commitLedger` returns `posting_disabled` and does not append a ledger row. There is no patient wallet.

Idempotent plans and refund negation are source behavior. They are not settlement payments.

## Settlement

Agreement rows can store a settlement period. The product does not run a settlement batch, open a dispute, or move funds.

## Consent

Membership starts at `pending_consent`. QR scan is rejected as an identity method. The notice text for Zambia is not approved, so the product does not activate a member by itself.

## Privacy

A shared membership does not open another clinic's chart. Check-in selects the agreement for the actor's clinic. A pass token is not written to the audit row.

## Required approvals before any further financial step

1. Approve the commercial model and the exact rates for a named clinic.
2. Approve the legal notice and the consent record.
3. Approve applying the reviewed schema on the disposable database only.
4. Approve a later change that can set an agreement active. That change does not exist in this source.
