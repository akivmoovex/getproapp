# V2.01 P1 Release Gate Summary

**Task:** `V2_01_P1_RELEASE_GATE_SUMMARY`  
**Date:** 2026-09-26  
**Mode:** Read-only synthesis of V2.01 P1 / production-candidate QA reports — **no code changes**, **no deployment**  
**Production RC under gate:** `gitSha=03a89106e2fe` · `moovex-platform-production` · hosts `blessboard.com` / `activeclinic.org`  
**V8 testing tip (reference only; not this gate):** post-overnight editor work ahead of production (placement, SP-T*, themes on testing)

**Inputs:** Production pack reports `V2_01_PROD_*`, `V2_01_AC_BOOKING_READINESS_QA`, `V2_01_BB_PROD_FUNCTIONAL_QA`, `V2_01_AC_PROD_FUNCTIONAL_QA`, plus overnight / post-overnight / HOST-PKG-A / master backlog for remaining P1 context.

---

## Gate verdict

### **BLOCKED**

Production RC `03a89106e2fe` is **not** clear for P1 release. Auth, security, booking, AC functional smoke, and most media lifecycle checks pass, but **image placement is absent on the RC** and **BlessBoard theme gallery / websites switcher return 503** on production.

---

## Summary table

| Task | Status | SHA | Hosted/Prod QA | Blocker | Owner action |
| --- | --- | --- | --- | --- | --- |
| `V2_01_PROD_QA_ACCOUNTS` | **READY** | `03a89106e2fe` | Prod login-verified disposable BB/AC personas | None | Keep vault off Git; use only disposable orgs |
| `V2_01_PROD_SHARED_SECURITY_PACK` | **PASS** (37/0/0) | `03a89106e2fe` | Prod deny/CSRF/cross-tenant/session | None (note: apex `GET /logout` 503 but session cleared) | Optional ops follow-up on BB apex `/logout` availability |
| `V2_01_PROD_PUBLISH_AUTH_QA` | **PASS** (14/0/0) | `03a89106e2fe` | Prod BB+AC allow/deny + UI + forged ID | None | None |
| `V2_01_PROD_MEDIA_PERSISTENCE_QA` | **FAIL** | `03a89106e2fe` | Prod BB+AC upload→publish→CDN **PASS**; **placement FAIL** both | **RC-MEDIA-PLACE** — RC has no `imagePlacement.js`; placement stripped from IMAGE JSON | Decide: accept RC without placement **or** promote V8 placement tip after retest |
| `V2_01_AC_BOOKING_READINESS_QA` | **FIXED_PASS** (26/0/0) | `03a89106e2fe` | Prod wizard + inquiry + staff record | None (historical `/book` 400 = FIXED_VERIFIED) | None |
| `V2_01_BB_PROD_FUNCTIONAL_QA` | **FAIL** (26/3/0) | `03a89106e2fe` | Prod core edit/publish/directory/auth **PASS** | **BB-THEME-503** (P1); **BB-WEBSITES-503** (P2) | Fix/route enable theme gallery on prod path **or** defer theme selection from P1 scope |
| `V2_01_AC_PROD_FUNCTIONAL_QA` | **PASS** (32/0/0) | `03a89106e2fe` | Prod register/login/forgot/dir/edit/catalogue/book/portal | None | None (email **delivery** still V8-001) |
| Shared IMAGE placement (V8 testing) | **PASS** on testing | `c2b86265` (testing) | Hosted V8 testing only | **Not on prod RC** — gap vs `03a89106e2fe` | Cutover decision: ship placement with next promote |
| Overnight SP-T2…T6 / U1 / AC·BB closures | **PASS** on testing | through `6dbf600e`+ | V8 testing | Not on prod RC | Do not treat as prod gate PASS until promoted + retested |
| Post-overnight SP-T7 / SP-VIS | **PASS** on testing | `0d28e328` / `a1bcaf48` | V8 testing | Not on prod RC | Same |
| **HOST-PKG-A** www Node | **BLOCKED_HOSTINGER_BACKEND** | ops (P0) | PID correlation only | Mapping not customer-visible | Hostinger backend ticket — **no** hPanel www unbind |
| **V2-MEDIA-01** (+ BB sermons/giving/contact) | **OPEN** DESIGN | — | Not prod-gated this pack | Privacy + design | Owner privacy/design gate before build |
| **VQ-FIX-001…006** | **OPEN** | — | Fixture-blocked visual | Fixtures / creds | Approve disposable seeds or mark OOS |
| **V8-001** transactional email | **OPEN** | — | Initiation PASS; delivery not claimed | SMTP/transport | Ops configure or accept risk |
| **V8-002 / V8-003** | **READY_FOR_OWNER_DECISION** | policy docs | N/A (no impl) | Policy | Choose A/B/C before any auth change |
| **BACKUP-PROD-VERIFY** | **UNKNOWN** | — | Requirements only | Restore evidence missing | Owner + Supabase restore drill |

---

## Remaining P1 blockers (this gate)

| ID | Source | Severity for gate | One-line |
| --- | --- | --- | --- |
| **RC-MEDIA-PLACE** | `V2_01_PROD_MEDIA_PERSISTENCE_QA` | **P1 release block** | Image crop/placement metadata does not persist on prod RC `03a89106e2fe` (feature exists only on later V8 testing tip) |
| **BB-THEME-503** | `V2_01_BB_PROD_FUNCTIONAL_QA` | **P1 release block** (if theme selection in scope) | `…/website/themes` and `/hq/website/themes` → **503 Unavailable** on production |
| **BB-WEBSITES-503** | Same | **P2** (scope switcher) | `…/website/websites` → **503**; HQ/branch shells still work |
| **HOST-PKG-A** | Hostinger Package A | **P0 ops** (capacity / www ownership) | Backend mapping UNKNOWN — parallel ops block, not fixed by product QA |
| **V2-MEDIA-01** family | Master backlog | **P1 product** (design-gated) | Not a prod smoke failure; still open backlog before claiming media redesign done |
| **VQ-FIX-*** | Master backlog | **P1 fixture** | Blocks visual re-score, not core publish/auth smoke |

---

## Classification

### Code bugs (product / route / missing on RC)

| Item | Why code |
| --- | --- |
| **RC-MEDIA-PLACE** | Prod tip lacks placement module; draft IMAGE values strip `placement` — reproducible on BB+AC disposable tenants |
| **BB-THEME-503** | Theme gallery routes return platform **503 Unavailable** (not auth deny) while styles/SEO/history work |
| **BB-WEBSITES-503** | Same class of unavailable path for websites list |

### QA-only (harness / scoring / not product defects)

| Item | Why QA-only |
| --- | --- |
| Publish-auth first-pass “Publish visible” for restricted | Lifecycle dialog template buttons — corrected; final **PASS** |
| Incomplete legacy `POST /book` → 400 | Design validation — **FIXED_VERIFIED**, not a booking defect |
| Apex `GET /logout` 503 (BB) | Supported logout is `POST /hq/logout` (functional PASS); availability is ops/UX note |
| `?website_mode=preview` without draft overlay (AC) | Supported preview is draft / `/website/preview` — scored PASS against supported path |

### Need owner approval (policy / ops / promote)

| Item | Decision needed |
| --- | --- |
| **Promote / cutover** | Whether to keep shipping `03a89106e2fe` vs promote V8 tip that includes placement + editor polish |
| **RC-MEDIA-PLACE accept vs block** | Accept “no placement on this RC” as out of P1 scope **or** require promote+retest |
| **BB-THEME-503** | Fix before gate **or** formally defer theme-pack selection from P1 |
| **HOST-PKG-A** | Hostinger backend escalation; accept UNKNOWN www worker risk explicitly if shipping anyway |
| **BACKUP-PROD-VERIFY** | Evidence of backup/PITR + restore drill |
| **V8-001** | SMTP for password-reset delivery |
| **V8-002 / V8-003** | Policy A/B/C before any RBAC code |
| **V2-MEDIA-01** | Privacy + design gate for YouTube embeds / sermons / giving / contact |

---

## P1 release gate: **BLOCKED**

**CLEAR** would require, at minimum:

1. **RC-MEDIA-PLACE** resolved (placement on RC + prod retest **PASS**) **or** explicit owner waiver that placement is out of this RC’s P1 scope.  
2. **BB-THEME-503** fixed and retested **or** owner waiver that theme gallery is out of P1 scope.  
3. Explicit go/no-go on **HOST-PKG-A** / backup evidence if this gate is tied to production promote confidence (P0 ops).

Until then: **`V2_01_P1_RELEASE_GATE = BLOCKED`**.

---

## What already green on prod RC (do not re-litigate)

- Disposable QA accounts **READY**  
- Shared security pack **PASS**  
- Publish auth allow/deny **PASS**  
- AC booking/inquiry **FIXED_PASS**  
- AC production functional smoke **PASS**  
- BB production functional smoke **PASS** for login, directory, edit, draft, publish, public verify, restricted deny, logout (theme/websites excepted)

---

## Return token

```
V2_01_P1_RELEASE_GATE = BLOCKED
prod_rc=03a89106e2fe
p1_blockers=[RC-MEDIA-PLACE, BB-THEME-503]
p0_ops=[HOST-PKG-A]
owner_decisions=[promote_vs_waive_placement, theme_scope, HOST-PKG-A, BACKUP-PROD-VERIFY, V8-001, V8-002, V8-003, V2-MEDIA-01]
```
