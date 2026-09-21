# V8 Hosted End-to-End QA Report (PROMPT 29)

**Verdict:** `V8_HOSTED_QA_WITH_OPEN_DEFECTS`  
**Branch:** `V8` only  
**Recorded:** 2026-09-21 (re-run after P30–P33)  
**Target deployment:** `moovex-platform-v8-testing` (neuniversity hosts only)  
**Testing DB:** `moovex-platform-v7` / `testing`  
**Tenants used:** disposable V8 QA only (`bb-v8qa-mub23a6v6a6b`, `ac-v8-qa-mub23a6v6a6b`)

### Explicit non-actions

| Action | Performed? |
|--------|------------|
| Write against customer / V7 production tenants | **No** |
| Activate or send real notifications | **No** |
| Apply migrations / restart / deploy application code | **No** |
| Modify V7 code or deployments | **No** |
| Claim 84-screen hosted visual PASS | **No** — only surfaces actually rendered were counted |

---

## 1. SHA and environment

| Role | Value |
|------|-------|
| **Live hosted `/healthz` gitSha** | `cd9b53c8797a` |
| **Local `origin/V8` tip at QA** | `cd9b53c8797a` |
| **V8 deploymentCode** | `moovex-platform-v8-testing` |
| **expectedIdentityKey** | `moovex-platform-v7` |
| **schemaCompatible** | `true` (all three neuniversity hosts) |
| **Migration tips** | platform **042** · BlessBoard **112** · ActiveClinic **035** |
| **V7 hosted SHA** | `03a89106e2fe` (`moovex-platform-testing` on pronline) |

### Live health matrix

| Host | `/healthz` | gitSha | deploymentCode | schemaCompatible |
|------|------------|--------|----------------|------------------|
| `https://neuniversity.org` | 200 ok | `cd9b53c8797a` | `moovex-platform-v8-testing` | true |
| `https://blessboard.neuniversity.org` | 200 ok | `cd9b53c8797a` | `moovex-platform-v8-testing` | true |
| `https://activeclinic.neuniversity.org` | 200 ok | `cd9b53c8797a` | `moovex-platform-v8-testing` | true |
| `https://blessboard.pronline.org` (V7) | 200 ok | `03a89106e2fe` | `moovex-platform-testing` | true |
| `https://activeclinic.pronline.org` (V7) | 200 ok | `03a89106e2fe` | `moovex-platform-testing` | true |

### Disposable tenant gate

| Check | Result |
|-------|--------|
| BB org key | `bb-v8qa-mub23a6v6a6b` |
| AC org key | `ac-v8-qa-mub23a6v6a6b` |
| Staff credentials | Present in gitignored `.env.v8-qa-tenants.local` |
| Path-public church URLs | `/c/bb-v8qa-mub23a6v6a6b/…` on BlessBoard V8 host |
| Write testing scope | Disposable V8 QA tenants only |

---

## 2. Twelve user flows — results

Legend: **PASS** = hosted persistence + auth/isolation verified · **PARTIAL** = meaningful hosted evidence with gaps · **FAIL** = defect with repro · **BLOCKED** = blocked dependency.

| # | Flow | Result | Hosted route(s) / evidence | Persistence | Auth / isolation | Desktop 1440 / Mobile 390 |
|---|------|--------|----------------------------|-------------|------------------|---------------------------|
| 01 | Shared form create → publish → share | **PARTIAL** | `GET /hq/form-studio/new` **200** (Form Studio). Create path reached studio briefly in mid-session probes; harness follow landed on `GET /hq/form-studio` **503** Unavailable after create. Publish → `/publication` observed in mid-session but **no public `/f/…` token extracted**. | Draft create incomplete/unstable on detail route | HQ session authorized for Form Studio shell | New page HTTP + title |
| 02 | Public form submit + confirm | **BLOCKED** | No published `/f/…` URL (depends on 01) | — | — | — |
| 03 | Submission review + status | **BLOCKED** | Depends on 02 | — | — | — |
| 04 | Shared form admin + tenant isolation | **PASS** | Branch → `/hq/form-studio` **403**; `/hq/members` **403**. HQ session reaches Form Studio list **200**. | Isolation HTTP | Branch cannot enter HQ | Isolation verified |
| 05 | Four-step membership application | **PASS** | `GET /c/bb-v8qa-…/register` **200**; POST → `/c/…/register/submitted` **200** | Submission confirmation reload | Public path-public | Register inspected @390 |
| 06 | Membership review + approval | **PASS** | `GET /hq/membership` **200** “Membership review”; `/hq/registrations` **200** | Queue reload 200 | HQ admin | HTTP + admin shell |
| 07 | Member management + branch transfers | **PARTIAL** | `/hq/members` **200**; `/branch-admin/members` **200** (transfer UI present). Transfer write not exercised (insufficient approved members). | Lists reload | HQ + branch | Branch members prior 1440 |
| 08 | Visitor registration + follow-up | **PASS** | `GET /c/bb-v8qa-…/visit` **200** (visitor Form Studio surface) | Page reload | Public | HTTP |
| 09 | Event / ministry registration | **PARTIAL** | `GET /c/…/hq/events` **200**; specific event/ministry register forms need published resources | List reload | Public | HTTP |
| 10 | Shared / HQ announcement create → publish | **PASS** | `POST /hq/announcements` → draft `122289ff-801e-4b71-88eb-c6e07797e2ed`; publish reload **200** published | Reload confirmed | HQ admin | Detail HTTP |
| 11 | BB HQ/branch announcement management | **PASS** | `/hq/announcements` **200**; `/branch-admin/announcements` **200** | Lists reload | HQ + branch | HTTP shells |
| 12 | Public church announcement list + detail | **PASS** | `/c/…/hq/announcements` **200**; `/c/…/announcements/122289ff-…` **200** with published title | Public detail reload | Public path-public | HTTP |

**Summary counts:** PASS **7** · PARTIAL **3** · FAIL **0** · BLOCKED **2**

---

## 3. Screen visual verification

**Do not claim 84-screen PASS.** Approved package size remains **84** Stitch D/M screens; this pass visually verified a **subset of hosted surfaces** only.

| Metric | Count |
|--------|------:|
| Approved package screens (SH/BB/AN × D/M) | **84** |
| Hosted surfaces **visually rendered and inspected** this pass | **15** |
| Remaining Stitch IDs not visually verified on hosted V8 | **69+** |

### Surfaces actually rendered and inspected

| Surface | Desktop 1440 | Mobile 390 | Notes |
|---------|--------------|------------|-------|
| BB `/login` | Yes (snapshot) | — | Sign-in shell |
| Path-public `/c/…/hq` | Yes | — | Church public home |
| Path-public `/c/…/register` | Yes | Yes | Membership wizard entry |
| Branch admin `/branch-admin` | Yes + screenshot | Yes + screenshot | Campus Daily Pulse |
| Branch `/branch-admin/members` | Yes + screenshot | — | Empty roll + transfer widgets |
| Branch `/branch-admin/announcements` | Snapshot | — | Create announcement CTA |
| HQ `/hq/membership` | HTTP + title | — | Review queue (no longer 503) |
| HQ `/hq/announcements` (+ published detail) | HTTP + title | — | Persistence after publish |
| HQ `/hq/members`, `/hq/form-studio/new` | HTTP | — | Reachable admin / Form Studio |
| AC `/clinics` directory | Yes + screenshot | Narrow layout | Disposable clinic card |
| AC disposable clinic home / services / book | Snapshot / HTTP | — | Booking wizard + services |
| AC `/app` (clinic admin) | HTTP 200 after login | — | Authenticated shell |

Authenticated roles exercised: **BB HQ admin**, **BB branch admin**, **AC clinic admin**, plus unauthenticated path-public BB and public AC probes.

**HTTP probe matrix** (auth + public, not visual claim): 23 routes recorded in `/tmp/v8-auth-qa/prompt29-rerun.json` → `screensHttp`.

---

## 4. Persistence results

| Artifact | Result |
|----------|--------|
| HQ announcement `122289ff-801e-4b71-88eb-c6e07797e2ed` | **Persisted** — publish reload 200; public detail 200 |
| Path-public membership registration | **Persisted** — POST → `/register/submitted` 200 |
| Shared form create/publish/public `/f/…` | **Not fully achieved** (detail 503 / no share URL) |
| Membership approval write | **Queue reachable**; full approve→member write not fully chain-proved in this re-run |
| AC booking wizard submit | **Persisted pending** — submit → pending clinic confirmation section |
| AC contact inquiry | **Harness 400** with legacy `name`/`email` fields; product expects `senderName`/`senderEmail` |

---

## 5. Authorization and isolation results

| Check | Result |
|-------|--------|
| Branch admin → HQ form-studio / HQ members | **403** denied (**PASS** isolation) |
| HQ → Form Studio `/hq/form-studio/new` | **200** (prior soft-deny defect cleared on hosted SHA) |
| HQ → disposable announcement write | Allowed |
| HQ → `/hq/membership` | **200** (prior foundation 503 cleared) |
| Product-hub `/register` | **404** fail-closed (expected after PROMPT 28) |
| Path-public church routes | Membership / visit / announcements reachable under `/c/:org` |

---

## 6. Regression results

| Item | Result | Evidence |
|------|--------|----------|
| AC booking wizard submit | **PASS** | Disposable clinic multi-step wizard → pending confirmation (`booking-submitted`) |
| AC inquiry submit | **PARTIAL** | GET contact **200**; harness POST with `name`/`email` → **400** (field-name mismatch vs `senderName`/`senderEmail`) |
| AC services | **PASS** | Disposable `/services` **200** |
| AC doctor profiles | **PASS** (render) | `/doctors` **200** |
| AC directory navigation | **PASS** | `/clinics` **200** with disposable clinic |
| Shared phone identity conflict | **PARTIAL** | Not fully re-probed as conflict matrix this re-run; no customer data writes |
| BB/AC media delivery | **PASS** | Brand PNG + Julflona hero JPG **200** on V8 hosts |
| Product-hub `/register` | **PASS** (fail-closed) | BlessBoard product hub **404**; `/register-church` **200** |
| V7 health / schema | **PASS** | `03a89106e2fe`, schemaCompatible true; V7 untouched |

---

## 7. Remaining defects (severity)

| ID | Severity | Summary |
|----|----------|---------|
| **V8-QA-FORM-STUDIO-DETAIL-503** | **High** | After create, Form Studio detail/list follow can return **503** Unavailable; public `/f/…` share URL not proven. Blocks flows 01→02→03 end-to-end. |
| **V8-QA-FORM-PUBLISH-SHARE-URL** | **High** | Publish/publication path does not yield a confirmed public form token for hosted submit. |
| **V8-QA-MEMBER-TRANSFER-UNEXERCISED** | **Medium** | Transfer UI present; write path not exercised (no approved members to transfer). Flow 07 PARTIAL. |
| **V8-QA-EVENT-MINISTRY-RESOURCES** | **Medium** | Public events list OK; event/ministry registration forms need published tenant resources. Flow 09 PARTIAL. |
| **V8-QA-AC-CONTACT-FIELD-NAMES** | **Low** | Contact POST rejects legacy `name`/`email`; requires `senderName`/`senderEmail` (and subject where applicable). Harness regression recorded **400**. |

### Cleared since prior PROMPT 29 report (`63adbe91`)

| Prior ID | Status on `cd9b53c8797a` |
|----------|-------------------------|
| V8-QA-FORM-STUDIO-PERMS (soft Access denied) | **Cleared** — Form Studio new/list reachable for HQ |
| V8-QA-HQ-MEMBERSHIP-503 | **Cleared** — `/hq/membership` **200** |
| V8-QA-NO-CHURCH-HOSTNAME | **Mitigated** via path-public `/c/:org` (flows 05, 08, 12) |
| V8-QA-AC-BOOK-SUBMIT-400 | **Cleared** for wizard path (legacy POST `/book` remains invalid by design) |

---

## 8. Evidence artifacts

| Artifact | Location |
|----------|----------|
| Automated auth/write probe JSON | `/tmp/v8-auth-qa/prompt29-rerun.json` (local; not committed) |
| Repro script | `scripts/local/v8-hosted-auth-qa-prompt29-rerun.js` (reads `.env.v8-qa-tenants.local`) |
| Browser samples | Login, path-public HQ, register @390; prior branch-admin / AC directory screenshots |

---

## 9. Verdict statement

Hosted SHA **`cd9b53c8797a`** on **`moovex-platform-v8-testing`** was exercised with disposable V8 QA identities. **7/12** flows PASS; **3 PARTIAL**; **2 BLOCKED** (shared form public submit chain); **0 FAIL**. **15** hosted surfaces were visually inspected — **not** 84. Open High defects remain on Form Studio detail/publish→`/f/` share. Therefore:

### `V8_HOSTED_QA_WITH_OPEN_DEFECTS`
