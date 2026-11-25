# G202 invoice integration

`previewInvoice` calls `decideEligibility` and then `calculateBenefit` only for `ELIGIBLE`. Every other decision returns a zero patient saving and the text `No community discount is applied.` An eligible Model A quote discloses `Community discount 10000 ngwee.` Model B discloses no patient discount because the saving is zero.

The preview does not write an invoice or a ledger row. `posted` is false. The check-in route selects the agreement for the actor's clinic from the store. It does not trust an agreement id from the browser. There is no retroactive invoice edit and no cross-clinic invoice write.
