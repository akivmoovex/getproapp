# Implemented features

No feature area is fully implemented. The D46–D53 edits are local controls inside areas that stay partial.

| Stage | Control | Acceptance |
|---|---|---|
| D46 | Profile event, receipt name, and invoiced charge stay in the caller’s organization or tenant | Not passed |
| D47 | Password reset uses the token’s organization and consumes the token before the password write | Not passed |
| D48 | A public booking unique-key conflict returns the stored request | Not passed. Not a slot lock |
| D49 | Encounter close, the open-encounter check, and facility alerts stay in the organization. Unknown encounter types are rejected | Not passed |
| D50 | Laboratory status writes, stock locks, facility keys, and a missed invoice post stay in the organization | Not passed |
| D51 | Released results join the request and facility in the same organization. A missed consent withdrawal writes no event | Not passed |
| D52 | No new consent type, allergy block, monitor, service level, clinical outbox, or versioned API | Not passed |
| D53 | G1 passed 308. No product edit | Not an acceptance pass |

Staff-created patients still do not require a portal. Registration still does not open a session. Signed notes are still not overwritten. Juflona signing stays off. The offline route still returns 503.
