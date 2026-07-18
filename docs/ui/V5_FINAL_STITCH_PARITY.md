# BlessBoard V5 — final Stitch parity audit

**Audit date:** 2026-07-18  
**Stitch project:** `projects/17124191473876947591` (GetPro Church Platform)  
**Screen map:** [`V5_STITCH_SCREEN_MAP.md`](./V5_STITCH_SCREEN_MAP.md)  
**Constraint:** No new product functionality. Small confirmed visual defects only (listed in §5).  
**Method:** Live MCP `list_screens` / `get_screen` + Stitch screenshot download for representative surfaces + V5 EJS/CSS inventory. **No route is classified `exact` without side-by-side live browser vs Stitch pixel comparison.**

---

## 1. Classification legend

| Class | Meaning |
|-------|---------|
| **exact** | Direct Stitch ↔ live comparison confirms layout, type, spacing, assets, and chrome match within tolerance. **None claimed this pass.** |
| **close** | Canonical Stitch pair wired; Sacred Modernity shell present; known token/chrome/copy gaps remain. |
| **intentional difference** | Product/security/backend chooses a different UX than Stitch (hostname tenants, list≠calendar, no fabricated metrics, apex transfer login, no billing, etc.). |
| **incomplete** | Route exists with functional V5 shell, but Stitch chrome/composition is only partially applied. |
| **blocked** | Stitch screen exists; V5 route and/or schema/role absent (or deferred by product). |

Obsolete Stitch duplicates are not product targets — see screen map. Empty Stitch variants are empty-state references only.

---

## 2. Executive summary

| Class | Implemented route pairs (desktop+mobile counted once) | Notes |
|-------|------------------------------------------------------:|-------|
| exact | **0** | No pixel-parity claim |
| close | **~48** | Apex home/auth, tenant public CMS, register, member modules, branch ops modules, HQ shell, platform plans/settings |
| intentional difference | **~12** | Calendar UIs, fabricated widgets/metrics, tenant password form, branch picker, billing/tickets, newsletter CTAs |
| incomplete | **~12** | Content-admin surfaces, HQ reports/audit chrome, platform dashboard/orgs/deployments, foundation tenant-landing |
| blocked | **~40** | Apex marketing subpages, prayer, departments, duty roster, monthly reports, HQ roles/broadcast, create-org UI, leader portal, waiting-verification, forgot-password |

**Verdict:** V5 is **functionally wired** for core church surfaces with **close** Sacred Modernity shells. It is **not** Stitch-exact. Platform and HQ “analytics” Stitch mocks remain **incomplete** or **intentional** because V5 refuses fabricated MRR/health/ticket metrics. Apex marketing beyond `/` remains **blocked**.

---

## 3. Direct comparison notes (sampled screenshots)

Compared Stitch screenshots (MCP download) against V5 view markup/CSS — not Playwright pixel diffs.

| Surface | Stitch ID (desktop) | Observation vs V5 |
|---------|---------------------|-------------------|
| Apex `/` | `46081ff8f3d04090b9de33020bdf1530` | Stitch: Features/Solutions/Pricing nav, “Register Your Church” + “Watch the video”, inset hero image. V5: full-bleed hero, Home/Login nav only, Login + Explore CTAs — **intentional** (routes missing; no video). Audience/capabilities/footer **close**. |
| Tenant `/` | `ead45db5be774baa9454412262096ffc` | Stitch: short nav, member-count overlay, service-times/prayer/newsletter widgets, demo announcements. V5: CMS hero + explore shortcuts only — **intentional** (no fabricated widgets). Hero/eyebrow/Giving CTA **close**. |
| Apex `/login` | `9b264ef3081f4b5aab493d9b9710b00b` | Stitch mock shows tenant-branded centered “Member Access” card + Forgot password. V5 apex dual-pane password form without forgot/register — **close** shell, **intentional** auth product. |
| Member `/member` | `4207a5a6a8ac4464b2b899695bbc7c78` | Stitch: purple welcome hero, quick actions incl. Prayer, calendar link, announcement rail. V5: shell + cards without prayer/directory fabrications — **close** shell, **intentional** module set. |
| Branch `/branch-admin` | `001d1a0235a14f47b456bb092a012f7c` | Stitch: dense stats, FAB, map, fabricated counts. V5: live pending/member counts only — **close** shell, **intentional** metrics policy. |
| HQ `/hq` | `538c8f4f1a844930ac058428bf390a76` | Stitch: charts, % trends, broadcasts, role mgmt. V5: branch count + registry links — **close** shell, **intentional**/partial chrome. |
| Platform `/admin` | `36c4708b025b4e7eaeab9ed508603b03` | Stitch: dark ops sidebar, reliability %, tickets, export. V5: light shell + live org counts — **incomplete** vs Stitch ops chrome; **intentional** no fake health/tickets. |

---

## 4. Per-route parity matrix

Columns: **Layout / Type / Spacing / Assets / Text / Behavior / A11y / Backend / Action**.

### 4.1 Apex public & auth

| Route | Viewport | Stitch desktop | Stitch mobile | Class | Layout | Type | Spacing | Assets | Text | Behavior | A11y | Backend | Final action |
|-------|----------|----------------|---------------|-------|--------|------|---------|--------|------|----------|------|---------|--------------|
| `/` (apex) | D+M | `46081ff8f3d04090b9de33020bdf1530` | `9f9927a608024e4ebaae11f13e68bdc5` | **close** (+ intentional nav/CTA) | Full-bleed vs Stitch inset hero | Hanken / violet close | Section rhythm close | Local homepage imagery | No Register/Watch video | No Features/Pricing routes | Skip/drawer present | Static | Optional: tighten hero composition only if product adds marketing routes |
| `/login` | D+M | `9b264ef3081f4b5aab493d9b9710b00b` | `68a84bcc8dff4f4ca5836216c22a2e6a` | **close** | Dual-pane apex vs Stitch centered card | Close | Close | Brand mark | No Forgot password | CSRF + transfer | Skip link | Auth transfer | Keep; do not add forgot UI without product |
| Auth error | D+M | (same auth family) | (same) | **close** | Solo auth main | Close | Close | Icons by state | Error copy only | No token leak | Skip link **fixed this pass** | Auth states | Done |
| `/account` | D+M | — (no dedicated Stitch) | — | **intentional difference** | Apex shell card | — | — | — | Account/logout | Session safe | — | Session | No Stitch target |
| `/features` | D+M | `7ef3518f23a0400098d810f617dd0cc0` | `5ac1e1b0600b4bc78f945e36b56aaece` | **blocked** | — | — | — | — | — | No route | — | — | Implement only with B5 marketing batch |
| `/pricing` (+FAQ) | D+M | `1c50e898…` / `c47840e7…` | `181ec1f8…` / `65067eb3…` | **blocked** | — | — | — | — | — | No route | — | — | B5 |
| `/for-churches` | D+M | `fc4bf5aab5bb4737a56d72030bae8803` | `55af3450069944598d9f0ce17df12da6` | **blocked** | — | — | — | — | — | No route | — | — | B5 |
| `/register-church` | D+M | `8640e8531e7144c3a048617592979cb7` | `515da582d2504feaaa00c03b7a2e77e1` | **blocked** | — | — | — | — | — | No route | — | — | B5 |
| `/directory` | D+M | `2b9df962…` / `02a9c170…` | `ab5d47e2…` / `a1b782ae…` | **blocked** | — | — | — | — | — | No route | — | Partial catalogue | B5 |
| Branch selector Stitch | D+M | `29709958…` | `4e0a399d…` | **intentional difference** | — | — | — | — | — | Hostname tenants | — | Resolution | Do not build picker |

### 4.2 Tenant public

| Route | Viewport | Stitch desktop | Stitch mobile | Class | Layout | Type | Spacing | Assets | Text | Behavior | A11y | Backend | Final action |
|-------|----------|----------------|---------------|-------|--------|------|---------|--------|------|----------|------|---------|--------------|
| `/` | D+M | `ead45db5be774baa9454412262096ffc` | `89177588fbf8405dbebd5747c38e19ce` | **close** + **intentional** | Hero + explore; no Stitch sidebar widgets | Close | Close | CMS `mediaUrl` or mesh | CMS headings | No demo metrics/prayer | Drawer/skip | Published sections | Keep intentional omissions |
| `/about` | D+M | `44492f6abbe849d0a8a89303ce83129b` | `3f0b8a5c30544d9495064df8d5f9e62e` | **close** | Section stack | Close | Close | Optional media | Published | Empty OK | — | Sections | Polish only if CMS assets land |
| `/leadership` | D+M | `372faa60f8df4983b627db3cb5d35f9d` | `0f4e816fd64d4592bd3677fbde3b7544` | **close** | Featured + grid | Close | Close | Initials fallback | Titles/roles | No Contact Pastor | — | Leaders | Keep |
| `/leadership` empty | D | `5f7b1d44bd454d45a0b72fb76d94bbd0` | — | **close** | Empty pattern | — | — | — | Empty copy | CTA to Contact/About | — | — | Keep |
| `/ministries` | D+M | `f146cdccadb34ff3bd8b0b75a0450d15` | `d2fd7ecc586541d3beb5d0d3bed98d56` | **close** | Card grid | Close | Close | Icon mesh | Published | No fake schedules | — | Ministries | Keep |
| `/events` | D+M | `6f618576f0304982bd239bfe04946e72` | `f58c416cbbd545429258d963b3a15b60` | **close** | List/featured | Close | Close | — | Published | List only | — | Events | Keep |
| `/events` calendar Stitch | D+M | `84b91938…` / `25677650…` | `0a38bd5b…` / `26db8f19…` | **intentional difference** | Calendar UI not built | — | — | — | — | List model | — | Events list | Do not port calendar |
| `/sermons` | D+M | `4f4995dc4ec84354ac80ed022a767ef3` | `96b380d4e47649c1bd7f05cabe9c3a1d` | **close** | List cards | Close | Close | — | Published | — | — | Sermons | Keep |
| `/giving` | D+M | `59c8fdedf68a43e3a5d2384b0c2212df` | `a0616f23568c464a95eda9e317e2fa9d` | **close** | Method cards | Close | Close | — | Methods | Info only, no pay | — | Giving methods | Keep |
| `/contact` | D+M | `ab93d842bf2e49caa838a1fd414eb35b` | `9cbad6aacb6246549913e275f228fa80` | **close** | Channels + form | Close | Close | Map if lat/lng | Channels | Form POST | — | Contact | Map needs coords |
| `/register` | D+M | `c360aef636d341a8ad3eb47c4c2e5c21` | `7d77190575b54d1b8277726570aec1c4` | **close** | Auth split | Close | Close | — | Form labels | CSRF submit | — | Registrations | Keep |
| `/register/submitted` | D+M | `1d37704351d6425ca872f8803322175c` | `f222e55152c349cc880548037aa7d540` | **close** | Confirmation | Close | Close | — | Success copy | — | — | — | Keep |
| Tenant `/login` | — | (Stitch password form) | (same) | **intentional difference** | No tenant form | — | — | — | — | 303 → apex transfer | — | Transfer | Never invent tenant password UI |
| Foundation landing | — | — | — | **incomplete** | Minimal inline CSS page | Hanken **font load fixed** | Basic | Badge | Placeholder copy | Read-only | — | Tenant resolve | Replace when full CMS host |

### 4.3 Auth deferred (Stitch only)

| Route | Stitch D / M | Class | Final action |
|-------|--------------|-------|--------------|
| Waiting verification | `239beae5…` / `8e6e504f…` | **blocked** | Product decision |
| Forgot password | `61a6861b…` / `f4bb9457…` | **blocked** | Product decision |

### 4.4 Member portal

| Route | Viewport | Stitch desktop | Stitch mobile | Class | Layout | Type | Spacing | Assets | Text | Behavior | A11y | Backend | Final action |
|-------|----------|----------------|---------------|-------|--------|------|---------|--------|------|----------|------|---------|--------------|
| `/member` | D+M | `4207a5a6a8ac4464b2b899695bbc7c78` | `b315a9d1288b4454bcc37f79c25c5e10` | **close** + intentional | Shell + cards vs dense Stitch hero | Close | Close | Optional | Welcome | No prayer/directory | Drawer/tabs | Member session | Optional visual tighten only |
| `/member/profile` | D+M | `a323f678…` | `55e21b65…` | **close** | Form layout | Close | Close | — | Profile fields | Save CSRF | — | Profile | Keep |
| `/member/announcements` | D+M | `63a9e613…` | `d7074e7c…` | **close** | List | Close | Close | — | Titles | Read published | — | Announcements | Keep |
| `/member/events` | D+M | `9a526853…` | `a4dc4a49…` | **close** + intentional | **List** not calendar | Close | Close | — | Events | RSVP if wired | — | Events | Keep list |
| `/member/ministries` | D+M | `05f9bdca…` | `53924d7e…` | **close** | List/cards | Close | Close | — | Ministries | Join flows | — | Participation | Keep |
| `/member/resources` | D+M | `d1690ab7…` | `d3232a4f…` | **close** | Resource list | Close | Close | Media | Titles | Download | — | Resources | Keep |
| `/member/forms` | D+M | `745a1972…` | `0f801e19…` | **close** | Forms list | Close | Close | — | Forms | — | — | Forms | Keep |
| `/member/requests` | D+M | `530cb58f…` | `6c5f8b31…` | **close** | Status list | Close | Close | — | Status | — | — | Requests | Keep |
| `/member/requests/new` | D+M | `2cfd58a5…` | `196260ba…` | **close** | Form | Close | Close | Attach | Labels | CSRF | — | Requests | Keep |
| `/member/giving` | D+M | `3e723670…` | `236d4bf2…` | **close** + intentional | Info methods | Close | Close | — | Methods | **No payments** | — | Giving methods | Keep info-only |
| `/member/prayer-request` | D+M | `57edf489…` | `1dd180a3…` | **blocked** | — | — | — | — | — | No route | — | No schema UI | Defer |

### 4.5 Branch administration

| Route | Viewport | Stitch desktop | Stitch mobile | Class | Layout | Type | Spacing | Assets | Text | Behavior | A11y | Backend | Final action |
|-------|----------|----------------|---------------|-------|--------|------|---------|--------|------|----------|------|---------|--------------|
| `/branch-admin` | D+M | `001d1a0235a14f47b456bb092a012f7c` | `615f1f4eabd645c4a6840349edb17cd1` | **close** + intentional | Shell dashboard | Close | Close | — | Live counts only | No FAB/map fabrications | Drawer | Branch scope | Keep |
| `/branch-admin/registrations` | D+M | `87fe9bb7…` | `d352ed07…` | **close** | Queue table | Close | Close | — | Queue | Approve/reject | — | Registrations | Keep |
| `/branch-admin/members` | D+M | `3dae337c…` | `e90963b0…` | **close** | Directory | Close | Close | — | Members | — | — | Members | Keep |
| `/branch-admin/members/:id` | D+M | `5e5985a0…` | `b3fbd9e2…` | **close** | Detail | Close | Close | — | Profile | — | — | Members | Keep |
| `/branch-admin/announcements` (+detail/form) | D+M | `65941542…` | `daa41602…` | **close** | List/editor | Close | Close | Media picker | Titles | Publish workflow | — | Announcements | Keep |
| `/branch-admin/attendance` (+`:id`) | D+M | `d351ae0e…` / `12e5e7d8…` | `5ea15ec1…` / `18a7d7a7…` | **close** | List/detail | Close | Close | — | Events | Record entries | — | Attendance | Keep |
| `/branch-admin/giving` (+`:id`) | D+M | `858c66cf…` / `cf849cdb…` | `0769a7e1…` / `20f32c9e…` | **close** + intentional | Manual summaries | Close | Close | — | Categories | **No gateway/QR** | — | Giving | Keep |
| `/branch-admin/requests` (+`:id`) | D+M | `126bfebf…` / `22fe4b70…` | `9b653109…` / `9d8f71d0…` | **close** | Queue/detail | Close | Close | Attachments | Status | Workflow | — | Requests | Keep |
| `/branch-admin/content*` | D+M | `3f316066…` / entity screens | `f2bb5e79…` / … | **incomplete** | Functional editor | Tokens partial | Functional | Media picker | Admin labels | CRUD/publish | — | Content | Stitch chrome pass later |
| Ministries/events content dirs | D+M | `58c96b4c…` / `ad136a0e…` | mobile pairs | **incomplete** | Shared entities UI | — | — | — | Generic | Not Stitch ministry profile | — | Content | Dedicated chrome optional |
| Departments | D+M | `7ee4d401…` | `3794bd0c…` | **blocked** | — | — | — | — | — | No schema | — | — | Out of V5 |
| Duty roster | D+M | `37bdc9ea…` | `51d3e5bf…` | **blocked** | — | — | — | — | — | No route | — | — | Out of V5 |
| Monthly reports (40–43) | D+M | various | various | **blocked** | — | — | — | — | — | Not ported | — | — | Out of V5 |

### 4.6 HQ administration

| Route | Viewport | Stitch desktop | Stitch mobile | Class | Layout | Type | Spacing | Assets | Text | Behavior | A11y | Backend | Final action |
|-------|----------|----------------|---------------|-------|--------|------|---------|--------|------|----------|------|---------|--------------|
| `/hq` | D+M | `538c8f4f1a844930ac058428bf390a76` | `c67eda7682de428d985416074f606fcf` | **close** + intentional | Shell + live branch count | Close | Close | — | No % trends | No broadcasts | Drawer | HQ scope | Keep no-fake-metrics |
| `/hq/branches` | D+M | `1a1aaecd…` | `2f154dfc…` | **close** | Registry table | Close | Close | — | Branches | — | — | Branches | Keep |
| `/hq/reports` (+attendance/giving) | D+M | `f6b63697…` / `2a577dc1…` | mobile pairs | **incomplete** + intentional | Tables vs Stitch charts | Close tokens | Functional | No charts | Operational totals | Month/branch filters | — | Aggregates | Do not invent charts/metrics |
| `/hq/audit` | D+M | `80d249f8…` / `bce1e8ec…` | mobile pairs | **incomplete** | Audit list vs Stitch “review queue” chrome | Close | Functional | — | Events | Read-only | — | Audit | Optional chrome polish |
| Monthly review (54–55) | D+M | various | various | **blocked** | — | — | — | — | — | No V5 workflow | — | — | Defer |
| Roles / templates / broadcast (59–61) | D+M | various | various | **blocked** | — | — | — | — | — | No routes | — | — | Defer |

### 4.7 Platform administration

| Route | Viewport | Stitch desktop | Stitch mobile | Class | Layout | Type | Spacing | Assets | Text | Behavior | A11y | Backend | Final action |
|-------|----------|----------------|---------------|-------|--------|------|---------|--------|------|----------|------|---------|--------------|
| `/admin` | D+M | `36c4708b025b4e7eaeab9ed508603b03` | `513dd5cc58c74b21bd7ee8d106dfac55` | **incomplete** + intentional | Light summary vs dark ops Stitch | Hanken; mono stack **fixed** (no unloaded JetBrains) | Functional | — | Live org counts | No tickets/health % | Tabs/drawer | Directory counts | Optional shell chrome; never fake MRR |
| `/admin/organizations` | D+M | `18da9665…` | `db6b741d…` | **incomplete** | Table list | Close | Functional | — | Org keys/names | Browse | — | Orgs | Chrome polish later |
| `/admin/organizations/:key` | D+M | `10f1dceb…` | `6633fa49…` | **incomplete** | Detail + entitlements | Close | Functional | — | Domains/plan | Assign/override CSRF | — | Entitlements | Keep backend; Stitch tenants UI optional |
| `/admin/organizations/new` | D+M | `d992150d…` | `0da4f454…` | **blocked** | — | — | — | — | — | CLI provision only | — | Provisioning svc | UI only if product requires |
| `/admin/plans` | D+M | `4d0f59ac…` | `b5953809…` | **close** + intentional | Catalogue table | Close | Close | — | Plan limits | **No billing UI** | — | Plans | Keep |
| `/admin/settings` | D+M | `30e38567…` | `efb0fd24…` | **close** + intentional | Read-only DNS patterns | Close | Close | — | Patterns | **No save/failover** | — | Deployments meta | Keep |
| `/admin/deployments` | D+M | `74cbe4a0…` | `9f400420…` | **incomplete** + intentional | Registry vs support/monitoring Stitch | Close | Functional | — | Deploy rows | No tickets/fake health | — | Deployments | Keep registry-only |

### 4.8 Leader portal (out of V5)

| Screens 46–50 | Class | Final action |
|---------------|-------|--------------|
| All leader portal pairs | **blocked** | No V5 leader role — out of scope |

---

## 5. Small visual defects fixed this pass

| Defect | Fix | Files |
|--------|-----|-------|
| Apex auth CSS cache skew (`?v=1` vs `?v=2`) | Bump shell to `?v=2` | `views/blessboard/v5/partials/apex-shell-start.ejs` |
| Auth error missing skip link | Add skip + main id | `views/blessboard/v5/apex/auth-error.ejs` |
| Tenant foundation landing named Hanken without load | Add Google Fonts preconnect/link | `views/blessboard/v5/tenant-landing.ejs` |
| Platform CSS referenced unloaded JetBrains Mono | Use system `ui-monospace` stack; bump CSS `?v=7` | `public/blessboard/v5/platform-admin.css`, `platform-admin-shell-start.ejs` |

**Not changed (not small / product):** platform mobile tab placement vs fixed bottom on other shells; Stitch calendar UIs; fabricated dashboard widgets; apex marketing routes.

---

## 6. Cross-cutting intentional differences (do not “fix” toward Stitch)

1. **Hostname tenant resolution** — no branch/church picker UI.  
2. **No fabricated metrics** — member counts, MRR, uptime %, ticket queues, growth %.  
3. **Events are lists** — not calendar grids (public or member).  
4. **Giving is informational / manual summaries** — no payment gateway.  
5. **Tenant `/login` redirects** to apex auth transfer — never a tenant password page.  
6. **Apex nav** remains Home/Login (or Account) until Features/Pricing/Directory exist.  
7. **Leader portal / departments / duty roster / monthly report workflows** — no V5 schema/role.  
8. **Platform create-org** — provisioning CLI; no invent-billing/support ticket UI.  
9. **Accessibility** — skip links, focus restore, reduced-motion, touch targets may differ from Stitch mocks (prefer a11y).  
10. **Church/org UUIDs** never rendered in HTML where security rules forbid.

---

## 7. Recommended next actions (priority)

1. **Do not claim exact** until Playwright (or Cursor Browser) side-by-side vs canonical IDs.  
2. **B5 apex marketing** if product needs Features/Pricing/Directory/Register Church.  
3. **Content-admin + platform dashboard chrome** if visual ops parity is required (still no fake metrics).  
4. **HQ reports** remain table/aggregate — only add charts if backed by real series.  
5. Keep regression via named GUI suites below.

---

## 8. Verification (this pass)

**Result:** all named suites below **PASS**; `git diff --check` **clean** (trailing blank EOF lines in five V5 CSS files normalized).

| Suite | Tests |
|-------|------:|
| `test:blessboard:apex-auth-gui` | 4 |
| `test:blessboard:apex-home` | 3 |
| `test:blessboard:public-pages` | 24 |
| `test:blessboard:design-system` | 8 |
| `test:blessboard:a11y-structure` | 15 |
| `test:blessboard:tenant-auth` | 13 |
| `test:blessboard:hq-shell` | 7 |
| `test:blessboard:branch-admin-shell` | 12 |
| `test:blessboard:platform-admin-shell` | 11 |
| `test:blessboard:member-portal` | 15 |
| `test:blessboard:content-admin` | 11 |
| `test:blessboard:announcements` | 16 |
| `test:blessboard:participation` | 11 |
| `test:blessboard:attendance` | 8 |
| `test:blessboard:giving` | 8 |
| `test:blessboard:forms-requests` | 10 |
| `test:blessboard:reports-audit` | 7 |
| `test:blessboard:media` | 15 |

---

*Canonical Stitch IDs and obsolete duplicates: [`V5_STITCH_SCREEN_MAP.md`](./V5_STITCH_SCREEN_MAP.md). Implementation history: [`V5_PUBLIC_STITCH_IMPLEMENTATION.md`](./V5_PUBLIC_STITCH_IMPLEMENTATION.md), [`docs/database/V5_IMPLEMENTATION_AND_STITCH_RECONCILIATION.md`](../database/V5_IMPLEMENTATION_AND_STITCH_RECONCILIATION.md).*
