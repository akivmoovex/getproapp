# D39 final report

An unusable assigned staff id is now rejected before a query on create, update, reschedule, and slot listing. Overlap behavior is otherwise unchanged: assigned staff only, the existing interval predicate, and no row lock.

Slot capacity remains `BLOCKED_APPROVAL_REQUIRED`. The pure helper returns null and is not wired into create. No schema, migration, or capacity number was added. The race test is gated and was not executed. Browser conflict cases were written down and not opened.

G1 passed 277, failed 0, and skipped 0. That does not prove a stored conflict or a capacity rule.

HEAD remains `b8f6b420d25e908de64ba292866c218c32edc30c`. Nothing was committed or pushed.
