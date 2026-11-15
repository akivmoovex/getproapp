# Coverage gap closure

Two appointment boundaries that the earlier tests did not call are now asserted. A blank or whitespace staff id stays usable and does not fail input validation before the organization lookup. A malformed staff id returns `invalid_input` and does not query. An invalid timestamp, and an end time that is not after the start, is not an overlap.

The live AC-05 denial, a stored portal activation, a second tenant’s invoice, and two competing database sessions are still open. Those need the disposable database and the browser. They were not executed. No fourteenth integration file was added, and the Playwright spec still has its seven held tests. No test uses an unconditional pass.
