# V2.01 Post-Overnight Targeted Status Summary

**Task:** `V2_01_POST_OVERNIGHT_TARGETED_SUMMARY`  
**Date:** 2026-09-26  
**Mode:** Status only — **no code**, **no deploy**, **no production promote**  
**Local / `origin/V8` tip:** `10a10bec9bad`  
**Hosted testing (this read):** `f1c2b5656307` · `moovex-platform-v8-testing` (product through SP-VIS; docs tip may lag)  
**Production:** `03a89106e2fe` · `moovex-platform-production` · **untouched**

**Inputs:** overnight summary · HOST-PKG-A closure · SP-T7 · SP-VIS reminder/pubfail · V8-002/003 policy pack

---

## Status table

| Task | Priority | Status | SHA | Hosted QA | Owner action | Remaining gap |
| --- | --- | --- | --- | --- | --- | --- |
| Overnight U1 / SP-T1–T6 + AC/BB closures | P1–P2 | **COMPLETE / PASS** | through `6dbf600e`–`79340398` | PASS | None | Living backlog polish only |
| **HOST-PKG-A** www Node hypothesis | **P0** ops | **BLOCKED_HOSTINGER_BACKEND** | status @ closure + verification | PID probes correlation only | **Hostinger backend** ticket — **no** hPanel unbind | Per-www worker ownership UNKNOWN |
| **HOST-CONSOL** multi-host one PID | P0 | OPEN / UNVERIFIED | — | — | Hostinger support question | Do not assume one Web App = one PID |
| **SP-T7** Add Section picker | P2 | **PASS** | `0d28e328` | PASS BB+AC 1440/390 | None | No Section Library (intentional) |
| **SP-VIS-REMINDER** + **PUBFAIL** | P2 | **PASS** | `a1bcaf48` (+ CSRF copy `f1c2b565`) | PASS reminder + CSRF fail | None for UX close | Optional happy-path publish smoke |
| **V8-002** org_admin ± patient.create | P3 | **READY_FOR_OWNER_DECISION** | policy @ `10a10bec` | N/A (no impl) | Choose A/B/C | Recommend **A** (keep least privilege) |
| **V8-003** catalogue-only login | P3 | **READY_FOR_OWNER_DECISION** | policy @ `10a10bec` | N/A (no impl) | Choose A/B/C | Recommend **B** if website staff first-class, else **A** |
| **V8-001** transactional email | P2 | OPEN | — | Delivery blocked | SMTP / ops | Not closed by editor QA |
| **V2-MEDIA-01** + BB sermons/giving/contact | P1 | OPEN DESIGN | — | — | Privacy + design gate | No overnight redesign |
| **AC-WE-OVERFLOW** / locations / theme packs | P2–P3 | OPEN / DEFERRED | — | — | Product triage | Non-blocking for editor path |
| Production promote | — | **NOT READY** | prod `03a89106e2fe` | — | Explicit cutover approval | See §5 |

---

## 1. Completed code work (testing)

- Shared editor Stitch polish **SP-T1…T6 / U1-A…D** (overnight).  
- **SP-T7** densified Add Section picker (shared WE01; draft-only; no library column).  
- **SP-VIS** reminder load-offer at threshold ≥5 + publish-failure UX (friendly message, real `requestId`, Retry / Keep Editing).  
- AC/BB historical bug paths **FIXED_VERIFIED** (closures).  
- Security identity / website infra debt: **NO_CHANGE_REQUIRED** on tip.

---

## 2. Infrastructure requiring Hostinger backend (not hPanel unbind)

- **HOST-PKG-A:** `BLOCKED_HOSTINGER_BACKEND` — www not separately exposed in hPanel/DNS; hostname→runtime mapping not customer-visible; per-www worker ownership **UNKNOWN**; PID probes are not proof. Escalate via `V2_01_HOST_PKG_A_HOSTINGER_ESCALATION.md`. **Do not** instruct owner to unbind www in hPanel.  
- **HOST-CONSOL:** support/backend question — multi-domain ≠ one `lsnode` PID until proven.  
- **HOST-NPROC-BASELINE:** optional owner Resource Usage screenshots (measurement only).  
- **No** Express redirect / blind `.htaccess` as a Package A “fix.”

---

## 3. Product policy decisions

| ID | Decision needed | Recommended default |
| --- | --- | --- |
| **V8-002** | Org admin inherit `patient.create`? | **A** — no; keep dual-role |
| **V8-003** | Catalogue-only `website_editor`/`publisher` login without legacy `user_roles`? | **B** if first-class website staff; else **A** WONT_CHANGE |

Fill owner tables in `V2_01_V8_002_V8_003_POLICY_DECISION.md` before any code.

---

## 4. Deferred technical debt

- **V2-MEDIA-01** + sermons/giving/contact redesign (design/privacy).  
- Extra Stitch theme packs / Section Library column / Web Studio (unsupported).  
- **AC-WE-OVERFLOW**, **AC-LOCATION-01/02**, **AC-WEBSITE-01**.  
- **VQ** fixtures / AN01–AN04 polish.  
- Field-history **service** tests skipped without local Postgres (UI covered).  
- Production backup/restore verification still **UNKNOWN**.

---

## 5. Production prerequisites

1. Do **not** promote from editor QA alone.  
2. Resolve or accept **HOST-PKG-A** only after Hostinger backend mapping (or formal accept UNKNOWN worker risk).  
3. Owner go/no-go on **V8-001** email and **V8-002/003** policy.  
4. Confirm production backup/restore evidence.  
5. Freeze + single-SHA BB+AC smoke on testing before cutover.  
6. Keep production at `03a89106e2fe` until authorized.

---

## Bottom line

Post-overnight **editor** gaps SP-T7 and SP-VIS are **PASS** on V8 testing. **HOST-PKG-A** is **BLOCKED_HOSTINGER_BACKEND** (no hPanel unbind). **V8-002/003** await owner policy decision. **Not production-ready.**
