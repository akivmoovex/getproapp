# Evidence validator

`QA/V213/AC_OVERNIGHT/D61/validate-acceptance-evidence.cjs` reads the 84-row matrix and a JSON report. It does not open a database or a browser.

It rejects a report when:

- A case is `PASS` and `database_evidence` is not `VERIFIED`.
- That pass has no 40-character SHA, no run id, or an environment other than `testing`.
- `g2_execution` is not `PASS`.
- An authenticated case lacks `authenticated_security_evidence` of `VERIFIED`.
- A concurrency case lacks `concurrency_evidence` of `VERIFIED`.
- The case class is `MISSING`, or `SEC-01-02` has no `live_denial` of `HTTP_403`.
- The coverage label is `MOCK_ONLY` or `PREPARED_NOT_RUN`.
- `skipped_as_pass` is true, or the case is skipped.
- `release_ready` is true while any of the 84 is not a qualified pass, or G2, G3, or G4 is not `PASS`.

An honest report with zero passes and `release_ready` false is accepted, and the release remains blocked. Exit 0 means the report did not make a false claim. Exit 1 means it did.
