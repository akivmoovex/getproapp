# V5 Demo Execution Worksheet

**Full plan:** [`V5_DEMO_E2E_SMOKE_TEST.md`](./V5_DEMO_E2E_SMOKE_TEST.md)  
**Mode:** Live tester worksheet — **do not** paste passwords here  
**Mark:** Pass · Fail · Blocked · Skip  

| Field | Value |
|-------|-------|
| Run ID | `demo-<YYYYMMDD>-____` |
| Tester | |
| Date (UTC) | |
| Routing mode | ☐ off · ☐ shadow · ☐ **authoritative** (full tenant) |
| Apex | `https://________________` |
| Tenant | `https://________________` |
| Org / church / branch | `________________` / `________________` / `________________` |

---

## Environment confirmation

| Check | OK |
|-------|----|
| `/healthz` Apex **200** | ☐ |
| Mode matches intent above | ☐ |
| `GETPRO_DATABASE_URL` unset (ops confirm) | ☐ |
| Identity `blessboard-platform-v5` (ops confirm) | ☐ |
| Full tenant only if **authoritative** | ☐ |

---

## Test-user checklist

| Persona | Vault item ready | Incognito window | Login verified |
|---------|------------------|------------------|----------------|
| PA | ☐ | ☐ | ☐ |
| HQ | ☐ | ☐ | ☐ |
| BA (`hq`) | ☐ | ☐ | ☐ |
| MEM | ☐ | ☐ | ☐ |
| INACTIVE (optional) | ☐ | ☐ | ☐ / Skip |
| WRONG_BRANCH_BA (optional) | ☐ | ☐ | ☐ / Skip |

No shared sessions across roles. No passwords in this sheet.

---

## Browser / device checklist

| Device | Browser | ☐ |
|--------|---------|---|
| Desktop ≥1280px | Chrome or Safari | ☐ |
| Mobile ≤390px (spot 320px) | Same or device | ☐ |

---

## Conventions

**Screenshots:** `demo-<RunID>-T##-<short>-<desk|mob>.png`  
Example: `demo-20260719-a-T06-tenant-home-desk.png`  

**Logs:** Note UTC + `requestId` if visible — never paste tokens, cookies, or passwords.  

**Defect severity:** SECURITY · CONFIG · DATA · PRODUCT · A11Y_UX · SKIP_FIXTURE  

**Retest:** ☐ Open · ☐ Fixed · ☐ Retest Pass · ☐ Retest Fail · ☐ Won’t fix  

---

## Apex

| # | Host | Role | Route | Action | Expected | Pass/Fail | Evidence | Notes |
|---|------|------|-------|--------|----------|-----------|----------|-------|
| T01 | Apex | ANON | `/` | Open home, scan nav/footer | 200; apex chrome; Powered by GetPro; no tenant CMS | | | |
| T02 | Apex | ANON | `/features` | Open page | 200; marketing only | | | |
| T03 | Apex | ANON | `/pricing` | Open plans | 200; no live checkout | | | |
| T04 | Apex | ANON | `/directory` | Open; follow one link if listed | 200; no UUIDs/secrets | | | |
| T05 | Apex | ANON | `/register-church` | Open enquiry | 200; no self-serve provision | | | |
| T09 | Apex | PA/HQ/BA/MEM | `/login` | Valid + invalid login | Valid OK; invalid controlled; host-only cookie | | | |
| T17 | Apex | PA | `/admin` (+ key subpages) | Open PA shell | Live counts; no fabricated MRR; no secrets | | | |

---

## Tenant public

| # | Host | Role | Route | Action | Expected | Pass/Fail | Evidence | Notes |
|---|------|------|-------|--------|----------|-----------|----------|-------|
| T06 | Tenant | ANON | `/` | Open home | 200 tenant shell **or** honest empty; no admin links | | | |
| T07 | Tenant | ANON | nav/footer | Click each enabled link | 200 or intentional empty; no drafts | | | |
| T08 | Tenant | ANON | `/login` | Sign in | Redirect Apex `/login?tr=…`; no tenant password form | | | |
| T10 | Both | MEM/HQ/BA | transfer | Login → return to portal | Lands intended portal; replay fails | | | |

---

## Registration

| # | Host | Role | Route | Action | Expected | Pass/Fail | Evidence | Notes |
|---|------|------|-------|--------|----------|-----------|----------|-------|
| T11 | Tenant | ANON | `/register` | Submit valid (+ one invalid) | Confirm pending path; field errors OK | | | |
| T12 | Tenant | ANON | submitted page | View confirmation | Pending messaging; no auto member login | | | |
| T13 | Tenant | BA | `/branch-admin` registrations | Approve pending (CSRF) | Branch-scoped only; approve OK | | | |

---

## Member portal

| # | Host | Role | Route | Action | Expected | Pass/Fail | Evidence | Notes |
|---|------|------|-------|--------|----------|-----------|----------|-------|
| T14 | Tenant | MEM | `/member*` | Open enabled modules | 200 or empty; staff URLs denied | | | |

---

## Branch Admin

| # | Host | Role | Route | Action | Expected | Pass/Fail | Evidence | Notes |
|---|------|------|-------|--------|----------|-----------|----------|-------|
| T15 | Tenant | BA | `/branch-admin*` | Walk enabled nav | Branch scope only; HQ-only forbidden | | | |

---

## HQ Admin

| # | Host | Role | Route | Action | Expected | Pass/Fail | Evidence | Notes |
|---|------|------|-------|--------|----------|-----------|----------|-------|
| T16 | Tenant | HQ | `/hq*` | Walk enabled nav | Church-wide; no fake charts; audit safe | | | |

---

## Platform Admin

| # | Host | Role | Route | Action | Expected | Pass/Fail | Evidence | Notes |
|---|------|------|-------|--------|----------|-----------|----------|-------|
| T17 | Apex | PA | `/admin*` | Orgs/domains/deployments spot | See Apex section; secrets absent | | | |

---

## Media

| # | Host | Role | Route | Action | Expected | Pass/Fail | Evidence | Notes |
|---|------|------|-------|--------|----------|-----------|----------|-------|
| T18 | Tenant | BA/HQ | media picker | Open picker | Church library only; no stock search | | | |
| T19 | Tenant | BA/HQ + ANON | upload / private URL | Upload OK; reject SVG; ANON denied private | CSRF enforced; no storage keys in HTML | | | |

---

## Authorization failures

| # | Host | Role | Route | Action | Expected | Pass/Fail | Evidence | Notes |
|---|------|------|-------|--------|----------|-----------|----------|-------|
| T21 | Both | wrong role | `/hq`, `/admin`, `/member` | Hit other-role URLs | 403/controlled redirect; no data leak | | | |
| T22 | Tenant | BA/HQ | other-branch paths | Attempt cross-branch | 403/404; no leak | | | Skip if no fixture |
| T23 | Other/Tenant | HQ/BA/MEM | other church / forged IDs | Attempt cross-church | Fail closed | | | Skip if no fixture |

---

## Inactive / suspended states

| # | Host | Role | Route | Action | Expected | Pass/Fail | Evidence | Notes |
|---|------|------|-------|--------|----------|-----------|----------|-------|
| T24 | Apex | INACTIVE | `/login` | Login attempt | Denied; no session | | | Skip if no fixture |
| T25 | Tenant | HQ/BA | inactive branch | Open inactive scope | Controlled unavailable | | | Skip if no fixture |
| T26 | Tenant | ANON | suspended site | Open `/` | Controlled unavailable; not 500 | | | Skip if no fixture |

---

## Mobile

| # | Host | Role | Route | Action | Expected | Pass/Fail | Evidence | Notes |
|---|------|------|-------|--------|----------|-----------|----------|-------|
| T28 | Both | ANON+staff+MEM | key pages ≤390px | Nav drawer / tabs | No H-scroll; usable targets; GetPro where required | | | |

---

## Security

| # | Host | Role | Route | Action | Expected | Pass/Fail | Evidence | Notes |
|---|------|------|-------|--------|----------|-----------|----------|-------|
| T20 | Matching | each | logout | Logout + rehit protected | Session cleared; CSRF on logout | | | |
| T27 | Matching | auth’d | POST without CSRF | Submit once | 403; no state change | | | |
| T29 | Both | ANON+PA+HQ | View source / PA deploy | Spot secrets | None (URLs, tokens, hashes) | | | |
| T30 | Both | matching | enabled nav | Spot-check links | No dead **enabled** links | | | |
| T31 | Ops | — | env + DB spot | Confirm isolation | No legacy tenants/session; host-only cookie | | | |

---

## Defect log (short)

| ID | T# | Severity | Summary (no secrets) | Retest |
|----|----|----------|----------------------|--------|
| D1 | | | | |
| D2 | | | | |
| D3 | | | | |

---

## Final approval

| Item | Result |
|------|--------|
| SECURITY defects open | ☐ none · ☐ list IDs ____ |
| Full journey (authoritative) complete | ☐ yes · ☐ partial (apex-only) · ☐ blocked |
| Evidence pack saved (path) | `________________` |
| Go / Hold / Rollback | ☐ Go · ☐ Hold · ☐ Rollback |
| Tester sign-off | ____________ UTC ________ |
| Reviewer sign-off | ____________ UTC ________ |

**Suggested order:** Env → T31 spot → T01–T05 → T06–T10 → T11–T14 → T15–T17 → T18–T19 → T20/T21/T27/T29–T30 → T28 → T22–T26 if fixtures.
