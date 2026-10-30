# V2.12 Development Baseline

## Source

- Source branch: `V11`
- Frozen V11 source SHA: `fbe7bea01f4e8d107b519b52b68e42e5b1c55686`
- V12 branch creation SHA: `fbe7bea01f4e8d107b519b52b68e42e5b1c55686`
- New feature development status: `NOT_STARTED`

V12 is an independent development branch created from the final documented V2.11 source freeze. V2.11 history and release documentation remain preserved.

## Inherited V2.11 baseline

V12 inherits the verified V2.11 announcement and Home accessibility test-contract corrections, the PL07 BlessBoard migration ceiling of 130, neutral legacy-route unavailable branding with HTTP 503 semantics, canonical `/login`, tenant isolation, and the verified security contracts.

## V2.11 carryover blockers

These items remain open and are not considered fixed by branch creation:

- Complete BlessBoard authenticated fixture workflows remain unverified.
- ActiveClinic authenticated editor and patient workflows remain unverified.
- QA244 synthetic administrator recovery remains blocked because the original account is not uniquely identified.
- No QA254 fixture was verified or recreated.
- Hosted testing reports only a SHA prefix; exact full hosted SHA evidence remains unavailable.
- Testing deployment metadata still displays `V9 testing`; the owner-controlled action to update it to `V2.11 Testing` remains outstanding.
- Production readiness remains `NO`.

## Development and release policy

- Develop and test V2.12 changes on `V12`; do not mutate `V11` as a development workspace.
- Preserve product runtime security, tenant isolation, migration ordering, and existing regression coverage.
- Use isolated, authorized testing fixtures only; do not use production data or credentials.
- Do not apply database migrations, reset databases, or deploy without separate release gates.
- Every release candidate must verify source SHA, build, security, migration integrity, regression coverage, hosted testing identity, and rollback readiness.

