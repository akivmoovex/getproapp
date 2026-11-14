# Concurrency tests

| Test | What it shows | Database |
|---|---|---|
| Same-tenant payment key | `ROLLBACK` and `duplicate_submission`. The new note is not stored | Not used |
| Other-tenant payment key | The duplicate return is not taken | Not used |
| Patient outside the tenant | No connection | Not used |
| Two overlap checks | Both return no collision until a row is stored. A later check sees it. A different staff member and a touching interval do not | Not used |
| Contract | Overlap text is before `BEGIN`. No `FOR UPDATE` and no `slot_capacity` in the appointment service | Not used |

Two in-memory checks passing is not evidence that two database connections are serialized. `PERSISTENT_CONCURRENCY` stays `NOT_VERIFIED`. The existing gated file still returns `NOT_RUN` and throws if the gate opens.
