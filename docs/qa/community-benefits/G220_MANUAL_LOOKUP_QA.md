# G220 manual lookup QA

Reception check-in already accepted a fallback code and an explicit patient id. This cycle adds a clinic-scoped name and phone lookup.

## Behavior

`searchLocalPatients` requires an authenticated reception or clinic-admin actor whose clinic matches the request. Results are limited to that clinic and, when supplied, that facility. A name needs at least two characters. A phone needs at least four digits and matches exactly. The response returns a display name, a masked phone, the facility id, and the patient id. It omits diagnosis text. Outcomes are `one`, `ambiguous`, and `none`. The function writes an audit row and does not create a patient, a chart link, an introduction, or a ledger row.

The check-in page posts `action=search`. One match asks the receptionist to confirm the chart before linking. More than one match asks for an explicit chart. The existing link path still requires that confirmation. A receptionist cannot choose a discount from this form.

## Assertions

| Case | Result |
| --- | --- |
| Existing patient by name | One masked candidate |
| Unknown name | No local patient |
| Same phone, two charts | Ambiguous, no link |
| Other facility | Excluded when facility is set |
| Other clinic actor | `wrong_clinic` |
| Billing role | `access_denied` |
| Short name and short phone | `invalid_search` |
| Search then settlement preview | Introduction, link, patient, and ledger counts unchanged |

The new unit file is `tests/v13/unit/g220-community-lookup-settlement.test.js`. The new browser case is in `tests/e2e/v13/v13-ac-community-benefits.spec.js` and is mock-backed. It is not PostgreSQL evidence.

Broader identifier search, including a national id, stays out of scope until an identity policy is approved.
