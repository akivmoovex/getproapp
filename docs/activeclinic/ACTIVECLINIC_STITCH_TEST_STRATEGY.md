# ActiveClinic — Stitch Test Strategy (AC-V6-11)

Tests are **planned** here; not implemented in AC-V6-11.

Existing suites to preserve: `tests/activeclinic-*.test.js`, BlessBoard isolation, db foundation, deployment profiles.

---

## First-wave screens (AC-V6-S01+)

### Route

- Unauthenticated `/app` → login redirect  
- Permission denial for facilities/staff/access/settings  
- Org scope: facility/staff of other org → not found / denied  
- Facility select ownership: cannot select unassigned facility  
- CSRF reject on POSTs  
- `/__ac/*` 404 in production mode  

### Service

- Loaders (once extracted) have no raw SQL in routes  
- Staff list does not leak other-org rows  
- Invitation / reset enumeration-safe behaviors remain  

### Form

- Login validation + lockout behavior regression  
- Activate password rules  
- Forgot always neutral  
- Facility/staff write forms (when added): validation, ownership, audit, redirect  

### Rendering

- Markers: `data-ac-shell`, `data-ac-page`  
- Active nav for facilities/staff/home  
- Desktop/mobile CSS hooks where used  
- Empty facilities/staff lists  
- Access denied / not-found simple states  

### AC-V6-S08 foundation states

- Suite: `tests/activeclinic-foundation-states-parity.test.js`
- Taxonomy + safe messages; HTML error handler status map
- Empty vs no-results markers; restricted without permission keys
- Context-unavailable clears ActiveClinic cookie; probes production-404
- Cross-tenant concealment; password non-echo; ActiveClinic branding only

### Visual (when tooling available)

- Compare Login / Shell / Dashboard to **P01** Stitch screenshots at desktop (~1280+) and mobile (~390)  
- Overflow, sticky header, drawer focus  

### Regression

- ActiveClinic session cookie isolation vs BlessBoard  
- No BlessBoard route/permission changes  
- Platform identity principal still required  
- Prior AC-V6-09 / AC-V6-10 tests remain green  

---

## Clinical waves

Defer until schemas exist. Minimum later: permission denial, patient-scope checks, audit assertions, Level 3 access tests.

---

## Explicit non-goals for early prompts

- Visual regression of P02–P07  
- Fabricating clinical fixtures  
- Production deploy checks as substitute for unit/integration tests
