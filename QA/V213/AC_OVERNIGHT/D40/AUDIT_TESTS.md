# Audit tests

`activeclinic.encounter.started` still carries facility, patient, and encounter type, and still has no `purpose` field. That gap stays open.

New tests:

- `tests/v13/unit/d40-clinical-scope.test.js` rejects pain `11`, a category that is not stored, another organization, and an encounter state that is not stored. The pain and category checks do not query.
- `tests/v13/contract/d40-clinical-foundation-contract.test.js` checks the organization predicates, the absent amendment insert, the absent purpose field, and the absence of `activeclinic.patients` under BlessBoard source.

These tests do not pass a clinical acceptance row. They do not open a database.
