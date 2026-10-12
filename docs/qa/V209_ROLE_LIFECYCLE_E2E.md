# V2.09 Role and User Lifecycle E2E

## Contract audit

| Capability | ActiveClinic | BlessBoard | Status |
|---|---|---|---|
| Organization registration | `/register-clinic` | `/register-church` | Implemented |
| Admin login/session | `/login` | `/login` → `/hq` | Implemented |
| Admin staff invitation | `/app/staff/invite`, invitation routes | HQ/branch invitation routes | Implemented |
| Staff activation/login | Activation service and identity linking | Invitation/role services | Implemented |
| Staff-created patient/member | Patient service/UI; member registration/review UI | Implemented |
| Portal activation | Existing-patient match at `/clinics/:clinicKey/patient/register` | Member registration contract requires review/activation | Partial |
| Platform-admin fixture | No safe local fixture exercised | N/A | Blocked |

The requested “member portal must link only to an existing member” behavior is
not assumed to be equivalent to the existing BlessBoard public member
registration/review workflow; this is a requirement decision point.

## Browser evidence

PASS: ActiveClinic admin login and BlessBoard HQ login.
PASS: ActiveClinic patient fixture, portal registration, and portal login were
verified in the isolated unified database.
NOT_RUN: fresh organization registration, browser staff invitation/activation,
staff-created patient/member flows, branch login, platform-admin login, logout,
refresh persistence, and negative isolation matrix.

## Blockers

- No completed browser lifecycle run for all required roles.
- Platform-admin local provisioning path was not exercised.
- BlessBoard member requirement needs confirmation against the existing
  registration/review contract.
- Existing V5 foundation tests remain separate with four stale V7 expectation
  failures.

No production access, production database access, schema reset, or product
runtime change occurred.
