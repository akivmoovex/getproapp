# ActiveClinic — Queue Ordering

**Prompt:** AC-V6-C05  
**Scope:** Queue position allocation and ordering rules

## Queue Number vs Queue Position

| Field | Purpose |
|-------|---------|
| `queue_number` | Daily sequential ticket number (e.g., 1, 2, 3…). Visible to patient. Allocated atomically via row-level lock. Never reused within same service point per day. |
| `queue_position` | Logical ordering position (1 = next to be served). Can change as higher-priority entries are added or entries are removed. |

## Allocation Rules

### Queue Number
1. Allocated via `SELECT COALESCE(MAX(queue_number), 0) + 1 … FOR UPDATE`
2. Per service point, per calendar day (resets daily)
3. Never gaps or reuse within same day
4. Immutable after allocation

### Queue Position
1. Initial position = current active count + 1
2. Priority affects initial position (future enhancement)
3. C05 implementation: simple linear ordering (FIFO within priority)
4. Future: dynamic reordering based on priority + wait time

## Priority Handling

### C05 Baseline (Simple)
- Lower `priority_level` = higher priority
- Entries without priority are treated as default (level 100)
- Ordering within same priority: FIFO (first arrival first served)

### Future Enhancement (Not in C05)
- Dynamic position adjustment when higher-priority entry arrives
- Wait time escalation (increase priority after threshold)
- Emergency override (admin can manually reorder)

## Active Queue Definition

Statuses included in active queue count:
- `waiting`
- `called`
- `serving`
- `paused`

Excluded statuses (terminal):
- `completed`
- `cancelled`
- `left_before_service`
- `transferred`

## Capacity Enforcement

Service points can define `max_queue_capacity`:
- `NULL` = unlimited
- `> 0` = hard limit on active queue count
- Exceeded capacity blocks new queue entry creation with `RESULT.CAPACITY_EXCEEDED`

## Duplicate Prevention

A patient cannot have multiple active queue entries for the same service point:
- Query: `WHERE patient_id = $1 AND service_point_id = $2 AND status IN ('waiting', 'called', 'serving', 'paused')`
- Result: `RESULT.DUPLICATE_ACTIVE_ENTRY`

## Listing Order

### By Service Point
```sql
ORDER BY queue_position ASC, created_at ASC
```
Shows entries in serve order.

### By Facility
```sql
ORDER BY created_at DESC
```
Shows recent arrivals first (dashboard view).

## Edge Cases

### Patient re-queued after "called"
Transition `called → waiting` does not change `queue_number` but may adjust `queue_position` to end of queue.

### Priority added after queue entry creation
C05: Not supported. Priority must be set at creation time.  
Future: Allow priority update with position recalculation.

### Service point capacity reached
New queue entries rejected with clear error code. Staff must complete or cancel existing entries to free capacity.

## Concurrency Safety

All queue number allocation and position updates happen within transactions:
1. Begin transaction
2. Lock service point queue via `FOR UPDATE`
3. Allocate number
4. Insert entry
5. Commit

Race conditions prevented via optimistic locking (`expectedVersion` check on status updates).
