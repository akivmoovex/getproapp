# V2.13.1 G12 — concurrency and recovery

No schema change was made. The appointment `stale_version` check is unchanged.

| Action | Existing protection | Remaining gap |
| --- | --- | --- |
| Second open visit | `duplicate_active_encounter` for the same patient and facility | HTTP not run |
| Second active queue row | `duplicate_active_queue_entry` | HTTP not run |
| Consultation draft | Version match, and a signed note cannot be updated | Two drafts are not merged |
| Laboratory fulfillment | A second insert for the same `clinical_order_id` is skipped | A second POST still creates a second clinical order. No idempotency key exists, and none was invented |
| Dispense | Requires `activeclinic.pharmacy.dispense` and the prescription row in the organization | A repeated dispense of a completed prescription returns `invalid_status` |
| Payment | `duplicate_submission` and `already_reversed` are present | HTTP not run |
| Closeout | One open row, version increment. Zero rows returns `stale_version` without writing | A network retry can observe the closed row. Partial failure after the status update is not wrapped in a new transaction in this phase |

Closeout without an actor or scope does not query. That negative case is in the new unit test.

```
CONCURRENCY_GAPS=No idempotency key for a repeated clinical order; HTTP races were not executed; appointment version check preserved
```
