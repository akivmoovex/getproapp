# ActiveClinic — Queue Lifecycle

**Prompt:** AC-V6-C05  
**Scope:** Reception queue status transitions and business rules

## Status Definitions

| Status | Meaning |
|--------|---------|
| `waiting` | Patient in queue, not yet called |
| `called` | Patient called to service point (loudspeaker/display) |
| `serving` | Staff actively serving patient at service point |
| `paused` | Service temporarily interrupted (e.g., waiting for records) |
| `completed` | Service point interaction finished |
| `cancelled` | Queue entry administratively cancelled |
| `left_before_service` | Patient left facility before being served |
| `transferred` | Patient transferred to different service point or facility |

## Allowed Transitions

```
waiting → called
waiting → cancelled
waiting → left_before_service
waiting → transferred

called → serving
called → waiting (patient not present, re-queue)
called → cancelled
called → left_before_service
called → transferred

serving → paused
serving → completed
serving → transferred
serving → cancelled

paused → serving
paused → completed
paused → transferred
paused → cancelled

completed → (terminal)
cancelled → (terminal)
left_before_service → (terminal)
transferred → (terminal)
```

## Business Rules

1. **Optimistic locking**: All status changes require correct `expectedVersion` to prevent race conditions.
2. **Append-only history**: Every transition appends a `queue_status_events` row. No updates or deletes.
3. **Actor required**: Staff member performing transition is recorded in audit trail.
4. **Reason code**: Optional short reason code (max 80 chars) for audit purposes.
5. **Completion outcome**: When transitioning to `completed`, optional outcome: `service_completed`, `referred_elsewhere`, `patient_declined`, `service_unavailable`, `other`.
6. **Serving staff**: Automatically set to actor when transitioning to `serving`.
7. **Called/serving timestamps**: Automatically captured on respective transitions.
8. **No back-transitions**: Terminal statuses (`completed`, `cancelled`, `left_before_service`, `transferred`) cannot be undone.

## Queue Position Management

- `queue_position` is recalculated when entries are removed from active queue (not implemented in C05 — simple linear ordering).
- Priority affects insertion point but does not automatically re-order existing entries.
- Future: Dynamic reordering based on priority and wait time (deferred to later prompt).

## Edge Cases

### Patient called but not present
Staff can transition `called → waiting` to re-queue patient.

### Service interrupted
Use `serving → paused` when waiting for external dependency (lab results, records, etc.). Resume via `paused → serving`.

### Patient left during service
Use `serving → cancelled` if patient leaves mid-service. Use `left_before_service` only if patient never reached service point.

### Transfer to another facility
Use `transferred` status. New facility creates new arrival and queue entry (out of scope for C05 — no cross-facility linking).

## Audit Trail

All transitions recorded in:
- `activeclinic.queue_status_events` (append-only, immutable)
- `platform.audit_events` (via `recordAuditEventSafe`)

Action keys:
- `activeclinic.reception.queue_entry_create`
- `activeclinic.reception.queue_status_change`
