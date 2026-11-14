# Acceptance quality rules

A case is `PASS` only when every required evidence field is `VERIFIED` and the report names a 40-character source SHA, a run id, and `environment_identity` of `testing`. `G2` must be `PASS` for that case. A skip, a mock, or `PREPARED_NOT_RUN` is not a pass.

| Required evidence | Who needs it | Current result |
|---|---|---|
| Isolated database | All 84 | Not run |
| Authenticated security | 28, including `SEC-01-02` | Not run. `SEC-01-02` is approval blocked until a live HTTP 403 |
| Concurrency or rollback | 28, the IDs whose required test names concurrency | Not run |
| Browser | The 7 G3 journeys, not all 84 | Not run |
| G4 release record | The release claim | Absent |

Current coverage of the 84, from the D29 class and the D55–D60 evidence:

| Label | Count |
|---|---|
| `VERIFIED` | 0 |
| `PARTIAL` | 46 |
| `PREPARED_NOT_RUN` | 13 |
| `MOCK_ONLY` | 0 as a case label. Mock tests exist and do not verify a case |
| `IMPLEMENTATION_MISSING` | 24 |
| `APPROVAL_BLOCKED` | 1, `SEC-01-02` |

The eight supplementary rows stay outside the release. A pass on an unimplemented feature is rejected. A pass that hides a skip is rejected. Release stays blocked while G2, G3, or G4 is absent.
