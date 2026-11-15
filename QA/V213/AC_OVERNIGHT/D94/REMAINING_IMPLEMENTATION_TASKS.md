# Remaining implementation tasks

These stay blocked until a named decision is approved. Do not invent the missing rule.

- Patient merge, after D21-03.
- Identifier policy outside `AC-YYYY-NNNNNN`, after D21-04.
- Slot capacity and a real database lock, after the capacity decision.
- Signed-note amendment, critical-result escalation, substitution, and allergy blocking.
- Retention, legal hold, and disposal.
- Backup restore.
- Offline writes and reconciliation beyond the current HTTP 503.
- Accessibility targets and monitor thresholds.
- Versioned clinical API and a clinical outbox.
- Break-glass and Juflona signing stay deferred.

Testing that is still unexecuted, and is not a substitute for those decisions:

- Disposable database G2, including portal persistence and two competing appointment sessions.
- Authorized browser G3, including a signed-in AC-05 denial that is HTTP 403.
- GitHub Stage A after the trigger approval, not merely a local `node --test`.
