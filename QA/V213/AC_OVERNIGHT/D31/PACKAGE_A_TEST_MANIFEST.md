# Package A test manifest

The 23 IDs are the `package=A` rows in `QA/V213/AC_OVERNIGHT/D29/FULL_84_CASE_TRACEABILITY.csv`. None is an acceptance pass.

| ID | Class | This stage |
|---|---|---|
| SEC-01-01 | PARTIAL | Audit purpose on clinical reads was not added |
| SEC-01-02 | BLOCKED | In-process admin denial remains. Live denial not run |
| SEC-01-03 | PARTIAL | No cross-clinic export execution |
| SEC-02-01 | PARTIAL | Expired organization-admin grant is denied in memory |
| SEC-02-02 | IMPLEMENTED_NOT_EXECUTED | Self-grant of organization admin returns `self_escalation_denied` before a query |
| PAT-01-01 | EVIDENCE_MISSING | Registration still does not issue a session. No patient row was written |
| PAT-01-02 | PARTIAL | Other-organization denial stays the D24 in-process result |
| PAT-01-03 | PARTIAL | Expired and revoked guest tokens stay the D24 in-process result. A valid booking token is still not consumed |
| APT-01-01 | IMPLEMENTED_NOT_EXECUTED | Unusable tenant identifiers return `invalid_input` before a query |
| APT-01-02 | PARTIAL | Staff overlap stays inside the assigned-staff guard. Not executed on a database |
| APT-01-03 | MISSING | No slot capacity and no `FOR UPDATE` |
| OTP-01-01 through OTP-03-03 | MISSING or PARTIAL | Worktree boundaries only. Production activation stays blocked |
| PLT-01-01 | PARTIAL | Shared CSRF still signs with the session secret |
| PLT-01-02 | PARTIAL | A token from another secret is rejected |
| PLT-01-03 | PARTIAL | Shell-extra override remains the earlier D05 contract |

New files: `tests/v13/unit/d31-package-a-security.test.js` and `tests/v13/contract/d31-package-a-contract.test.js`. They do not open a database.
