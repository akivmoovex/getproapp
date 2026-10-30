# V212 Background Job Contract

Repository inspection identifies application workers and asynchronous work patterns, but no proven tenant-safe cancellation/reconciliation contract for every pending, running, scheduled, retry, or failed job. Job ownership must be established from payload and tenant/product context; absence of a foreign key is not ownership proof.

Future reset coordination must pause admission for affected scopes, drain or safely cancel running work, reconcile retries and schedules, verify no affected jobs remain, and resume processing only after recovery checks. Existing workers and job records were not stopped or mutated. Because this contract is not implemented and externally executed work may exist, every destructive reset scope remains BLOCKED.
