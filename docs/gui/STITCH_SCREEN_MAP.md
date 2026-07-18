# BlessBoard V5 — permanent Stitch screen map

**Created:** 2026-07-18  
**Stitch project:** `projects/17124191473876947591` — **GetPro Church Platform**  
**Live MCP inventory:** `list_screens` → **196** screens; project `screenInstances` → **217** (layout instances may exceed unique screens)  
**Project updateTime (Stitch):** `2026-07-18T12:21:54.870095Z`  
**Constraint:** Documentation only. No application code changed in this pass.

## Sources of truth

| Layer | Authority |
|-------|-----------|
| Visual layout, spacing, typography, chrome | Connected Stitch project (canonical IDs below) |
| Routes, data access, authn/authz, forms, sessions | V5 backend (`src/blessboard`, `src/platform`) |
| Wording / feature intent only | V4 (inspect only; never port DB/session patterns) |

Related prior audits (do not replace this map): `docs/ui/V5_STITCH_SCREEN_MAP.md`, `docs/ui/V5_FINAL_STITCH_PARITY.md`, `docs/blessboard-approved-stitch-screens.md`.

## Status legend (allowed values only)

| Status | Meaning |
|--------|---------|
| **MATCHED** | Side-by-side Stitch ↔ live browser parity claimed. **None claimed this audit** (see final parity doc). |
| **PARTIAL** | Canonical Stitch pair wired into V5 EJS/CSS; known token/chrome/copy gaps remain, or intentional product differences documented in Notes. |
| **PLACEHOLDER** | V5 route + functional shell exist; Stitch composition/chrome not applied (or only lightly). |
| **MISSING** | Stitch screen exists; no matching V5 product route/view (or blocked by missing schema/role). |
| **STITCH_MISSING** | V5 route/view exists; no dedicated Stitch desktop/mobile pair found. |
| **NEEDS_VERIFICATION** | Mapping uncertain, design-system/reference board, or visual parity not re-checked in browser this pass. |

## Canonical selection rules

1. Prefer **Populated / Refined / Restored / v2+** variants over older base titles.
2. Keep **Empty** variants as empty-state references (same route; noted in Notes).
3. Prefer BlessBoard marketing titles over older `01-platform-home-*` / `01-platform-church-finder-*` for apex.
4. Prefer `25-branch-admin-dashboard-*` over misfiled `04-branch-admin-dashboard-*`.
5. Leadership mobile canonical is **`03-public-leadership-mobile-v4 (Restored)`**, not duplicate v2 Populated IDs.
6. Do **not** invent routes to match Stitch filenames. Calendar / departments / leader / monthly-report Stitch UIs stay `MISSING` or intentional-difference until product + schema exist.
7. Tenant `/login` Stitch is a password form; V5 **redirects to apex transfer** — do not invent tenant password UI.

## Summary counts (this map)

| Metric | Count |
|--------|------:|
| Unique Stitch screens (`list_screens`) | 196 |
| Primary product rows in master table (logical screens) | 96 |
| Rows status **MATCHED** | 0 |
| Rows status **PARTIAL** | 48 |
| Rows status **PLACEHOLDER** | 14 |
| Rows status **MISSING** | 24 |
| Rows status **STITCH_MISSING** | 8 |
| Rows status **NEEDS_VERIFICATION** | 2 |
| Obsolete / duplicate Stitch screens (appendix; not primary targets) | 44 |
| Design / asset / spec boards (appendix) | 9 |

---

## Master screen table

Paths under `views/` are relative to `views/blessboard/v5/`. Access values: `anon` · `public` (tenant host) · `member` · `branch_admin` · `hq_admin` · `platform_admin` · `design`.

| Order | Area | Screen | Desktop Stitch ID | Mobile Stitch ID | Intended route | Current route | Current template/component | Access | Status | Notes |
|------:|------|--------|-------------------|------------------|----------------|---------------|----------------------------|--------|--------|-------|
| 1 | Shared design system | Visual System Specification | `c8d8352b1b95400cb25e32a79c2f0b2e` | — | — (tokens) | — | `public/blessboard/v5/design-tokens.css`, `design-system.css` | design | NEEDS_VERIFICATION | Markdown/spec board; Sacred Modernity tokens partially applied (Hanken, `#6C5CE7`). |
| 2 | Shared design system | Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` | — | — (states) | — | `partials/empty-state.ejs`, `error-state.ejs`, `loading-state.ejs`, `success-state.ejs`, `flash-message.ejs`, `form-errors.ejs` | design | PARTIAL | Spec board for empty/error/loading/form states; not a product route. |
| 3 | Apex marketing | Home | `46081ff8f3d04090b9de33020bdf1530` | `9f9927a608024e4ebaae11f13e68bdc5` | `/` (apex) | `/` (apex) | `apex/page.ejs` via `renderFoundationHome`; `public/blessboard/v5/apex.css` | anon | PARTIAL | Exact titles: *BlessBoard - One digital home…*. Nav/CTAs intentional vs Stitch (no Features/Pricing routes yet). |
| 4 | Apex marketing | Features | `7ef3518f23a0400098d810f617dd0cc0` | `5ac1e1b0600b4bc78f945e36b56aaece` | `/features` | — | — | anon | MISSING | Stitch titles: *BlessBoard - Features (Desktop/Mobile)*. No V5 route. |
| 5 | Apex marketing | For Churches | `fc4bf5aab5bb4737a56d72030bae8803` | `55af3450069944598d9f0ce17df12da6` | `/for-churches` | — | — | anon | MISSING | No V5 route. |
| 6 | Apex marketing | Register Your Church | `8640e8531e7144c3a048617592979cb7` | `515da582d2504feaaa00c03b7a2e77e1` | `/register-church` | — | — | anon | MISSING | No V5 route; provisioning remains CLI/platform today. |
| 7 | Apex marketing | Church Directory | `2b9df962f4ff4b4e8a45be51f99a5497` | `ab5d47e2d6c54065a4eb66c906d3c39c` | `/directory` | — | — | anon | MISSING | Prefer BlessBoard Directory titles over obsolete `01-platform-church-finder-*`. Hostname catalogue partial in platform DB. |
| 8 | Apex marketing | Pricing | `1c50e8987d9043ec941b07fb0f67cef5` | `181ec1f8076c4ae7ad6be92d5a4861f3` | `/pricing` | — | — | anon | MISSING | No V5 route. |
| 9 | Apex marketing | Pricing Details & FAQ | `c47840e7030c449a94c4ce4a03fa932f` | `65067eb3ebfe45b2a810531334c54684` | `/pricing#faq` | — | — | anon | MISSING | Same missing `/pricing` surface. |
| 10 | Apex login & account | Login | `9b264ef3081f4b5aab493d9b9710b00b` | `68a84bcc8dff4f4ca5836216c22a2e6a` | `/login` (apex) | `/login` | `apex/login.ejs`, `apex-auth.css` | anon | PARTIAL | Batch 07 chrome. Stitch titles: `09-auth-member-login-*`. Apex dual-pane; no forgot-password. Tenant hosts redirect to apex transfer. |
| 11 | Apex login & account | Auth error | — | — | auth error presentation | auth error render | `apex/auth-error.ejs` | anon | STITCH_MISSING | Batch 07 dual-pane error chrome. Expired/throttled/generic only; no tokens. |
| 12 | Apex login & account | Account | — | — | `/account` | `/account` | `apex/account.ejs` | authenticated | STITCH_MISSING | Session-safe account card + logout; no dedicated Stitch screen. |
| 13 | Tenant public | Home | `ead45db5be774baa9454412262096ffc` | `89177588fbf8405dbebd5747c38e19ce` | `/` (tenant) | `/` | `public/home.ejs` via `public/page.ejs`, `tenant-public-shell-*`, `tenant-public.css` | public | PARTIAL | Titles: `01-public-home-*-v2 (Refined)`. No fabricated Stitch widgets/metrics. Older home copies obsolete (appendix). |
| 14 | Tenant public | About | `44492f6abbe849d0a8a89303ce83129b` | `3f0b8a5c30544d9495064df8d5f9e62e` | `/about` | `/about` | `public/about.ejs` | public | PARTIAL | Titles: `02-public-about-*-v3 (Populated)`. |
| 15 | Tenant public | Leadership | `372faa60f8df4983b627db3cb5d35f9d` | `0f4e816fd64d4592bd3677fbde3b7544` | `/leadership` | `/leadership` | `public/leadership.ejs` | public | PARTIAL | Desktop populated v2; mobile **v4 Restored**. Empty ref: `5f7b1d44bd454d45a0b72fb76d94bbd0` (desktop). |
| 16 | Tenant public | Ministries | `f146cdccadb34ff3bd8b0b75a0450d15` | `d2fd7ecc586541d3beb5d0d3bed98d56` | `/ministries` | `/ministries` | `public/ministries.ejs` | public | PARTIAL | Titles: `04-public-ministries-*-v4 (Populated)`. |
| 17 | Tenant public | Events (list) | `6f618576f0304982bd239bfe04946e72` | `f58c416cbbd545429258d963b3a15b60` | `/events` | `/events` | `public/events.ejs` | public | PARTIAL | List/featured model (Batch 05). Empty ref: `6c3a2b460ac54e6a88336af9085e8c38`. Calendar Stitch variants obsolete for V5. |
| 18 | Tenant public | Sermons | `4f4995dc4ec84354ac80ed022a767ef3` | `96b380d4e47649c1bd7f05cabe9c3a1d` | `/sermons` | `/sermons` | `public/sermons.ejs` | public | PARTIAL | Batch 05 featured + recent grid. Empty ref: `0c7262cdda4547739ec0c1fa5128fb51`. No series/scripture/duration schema. |
| 19 | Tenant public | Giving | `59c8fdedf68a43e3a5d2384b0c2212df` | `a0616f23568c464a95eda9e317e2fa9d` | `/giving` | `/giving` | `public/giving.ejs` | public | PARTIAL | Batch 06 info-only methods; no payment gateway. Empty ref: `a08093b9ec32467bad300ef43ac800fa`. |
| 20 | Tenant public | Contact | `ab93d842bf2e49caa838a1fd414eb35b` | `9cbad6aacb6246549913e275f228fa80` | `/contact` | `/contact` | `public/contact.ejs` | public | PARTIAL | Batch 06 cards + map. Map only when branch lat/lng present. No contact form (unsupported). |
| 21 | Tenant public | Foundation / unresolved landing | — | — | controlled fallback | foundation / off / shadow modes | `tenant-landing.ejs` / `renderFoundationHome` / controlled errors | public | STITCH_MISSING | Minimal foundation page when routing mode is not authoritative; not a Stitch CMS home. |
| 22 | Tenant auth | Member registration | `c360aef636d341a8ad3eb47c4c2e5c21` | `7d77190575b54d1b8277726570aec1c4` | `/register` | `/register` | `public/register.ejs`, `tenant-auth.css` | public | PARTIAL | Batch 07. Titles: `10-auth-member-registration-*`. V5 fields only (no Stitch password/gender wizard). |
| 23 | Tenant auth | Registration submitted | `1d37704351d6425ca872f8803322175c` | `f222e55152c349cc880548037aa7d540` | `/register/submitted` | `/register/submitted` | `public/register-submitted.ejs` | public | PARTIAL | Batch 07. Titles: `11-auth-registration-submitted-*`. No fabricated timing/ID. |
| 24 | Tenant auth | Waiting verification | `239beae5140e44aeb34ba7034260cd5b` | `8e6e504fcfa6452f9f3a719da33527fe` | — (product undecided) | — | — | member-pending | MISSING | No V5 route/service. Do not invent session model. |
| 25 | Tenant auth | Forgot password | `61a6861b34aa4c5390d4103b9d4da7b7` | `f4bb9457291d44d0ac8be0ab5017d9a0` | — (product undecided) | — | — | anon | MISSING | No V5 route. Apex login intentionally omits link. |
| 26 | Member portal | Dashboard | `4207a5a6a8ac4464b2b899695bbc7c78` | `b315a9d1288b4454bcc37f79c25c5e10` | `/member` | `/member` | `member/dashboard.ejs`, `member-shell-*`, `member-portal.css` | member | PARTIAL | No prayer quick-action (route absent). |
| 27 | Member portal | Profile | `a323f678460c4d62bfe1a8de462f58e1` | `55e21b658b57471db74eccd77e386079` | `/member/profile` | `/member/profile` | `member/profile.ejs` | member | PARTIAL | Batch 08C. Existing fields only; no DOB/address/QR/avatar/password. |
| 28 | Member portal | Announcements | `63a9e6139ffd41f19b6b6d2f090f0199` | `d7074e7cfd7048c98abb960826673c01` | `/member/announcements` | `/member/announcements` | `announcements/member-list.ejs` (+ `member-detail.ejs`) | member | PARTIAL | Batch 09A. Real audience/read data; no fabricated delivery metrics. Detail has no dedicated Stitch pair. |
| 29 | Member portal | Events | `9a52685310ce4231bd9767ee3257c906` | `a4dc4a494cc54143b76671bd89cdaa69` | `/member/events` | `/member/events` | `participation/member-events.ejs` (+ detail) | member | PARTIAL | Batch 09B. List UI (not calendar). Real dates/venues/registration only. |
| 30 | Member portal | My ministries | `05f9bdca09fd456595a15b963be8092a` | `53924d7ece3e46e79d84556e56335b6e` | `/member/ministries` | `/member/ministries` | `participation/member-ministries.ejs` | member | PARTIAL | Batch 09C. Real memberships only; no leaders/chat/rosters. |
| 31 | Member portal | Resources | `d1690ab7193d43e38ba9ba97c29d914c` | `d3232a4f5e0f4d2da610740ca3a8f6b1` | `/member/resources` | `/member/resources` | `forms-requests/member-resources.ejs` (+ detail) | member | PARTIAL | Batch 10A. Published members-audience only; file/info filters + search; no categories/certificates/progress. |
| 32 | Member portal | Forms | `745a1972c0ba4ec893f64cc3457c0c95` | `0f801e19ed3d4332bee877001bdc1a13` | `/member/forms` | `/member/forms` | `forms-requests/member-forms.ejs` (+ detail, submission) | member | PARTIAL | Batch 10B. Published forms only; real submitted/closed history; no PDF/builder/payments. |
| 33 | Member portal | Submit request | `2cfd58a5ea094831a3a44eed73c44165` | `196260bada8445d5b107f4be552540dc` | `/member/requests/new` | `/member/requests/new` | `forms-requests/member-request-new.ejs` | member | PARTIAL | Batch 10C. Supported categories only; no urgent checkbox, uploads, or SLA copy. |
| 34 | Member portal | Request status | `530cb58f684646b9b084f45eb2e17e90` | `6c5f8b31ee394643a69dd7fe01c3e67e` | `/member/requests` | `/member/requests` | `forms-requests/member-requests.ejs` (+ detail) | member | PARTIAL | Batch 10C. Own requests only; real status badges/timeline; no fabricated metrics/hotline. |
| 35 | Member portal | Prayer request | `57edf48979d04b6d8647474961b48acb` | `1dd180a3c5c5463988cb96dde2b44d37` | `/member/prayer-request` | — | — | member | MISSING | No V5 route; dashboard action disabled. |
| 36 | Member portal | Giving (info) | `3e72367008054943b23f6c690bac8eea` | `236d4bf2f588459f8cde18bd164b09cd` | `/member/giving` | `/member/giving` | `member/giving.ejs` | member | PARTIAL | Batch 10D. Published branch methods only; instructional; no checkout/QR/fabricated balances. |
| 37 | Branch admin | Dashboard | `001d1a0235a14f47b456bb092a012f7c` | `615f1f4eabd645c4a6840349edb17cd1` | `/branch-admin` | `/branch-admin` | `branch-admin/dashboard.ejs`, `branch-admin-shell-*` | branch_admin | PARTIAL | Prefer 25-* over obsolete 04-* duplicates. Live counts only — no fabricated Stitch metrics. |
| 38 | Branch admin | Verification queue | `87fe9bb70b79434e88b91e0fd877d238` | `d352ed076bbe4fabb1ad6f5ef66c0a25` | `/branch-admin/registrations` | `/branch-admin/registrations` | `branch-admin/registrations.ejs` (+ `registration-detail.ejs`) | branch_admin | PARTIAL | |
| 39 | Branch admin | Member directory | `3dae337c97e242049670749c2b1ab09d` | `e90963b00bcf41368d089053a3a5db07` | `/branch-admin/members` | `/branch-admin/members` | `branch-admin/members.ejs` | branch_admin | PARTIAL | |
| 40 | Branch admin | Member profile | `5e5985a087d049109c49006f99095884` | `b3fbd9e2eda64a2b998ec0e2a4311229` | `/branch-admin/members/:id` | `/branch-admin/members/:id` | `branch-admin/member-detail.ejs` | branch_admin | PARTIAL | |
| 41 | Branch admin | Ministries directory | `58c96b4c5b554e6991fc080c63783b6c` | `526c14042cb045fd8c2cfcb568e2c8ae` | `/branch-admin/content/ministries` | `/branch-admin/content/ministries` | `content-admin/entities.ejs` | branch_admin | PLACEHOLDER | Generic content-admin list vs Stitch ministries directory chrome. |
| 42 | Branch admin | Ministry profile | `064769bb18ab455fb2a39adf2f3c080a` | `17509b0d718346daaf4ac3b6c6f29d42` | `/branch-admin/content/ministries` (entity) | content entity fields | `content-admin/entity-fields.ejs` | branch_admin | PLACEHOLDER | |
| 43 | Branch admin | Departments | `7ee4d401f26d45b8ae18f26fe9b391ec` | `3794bd0c398b42cbb3987964807b27c3` | — | — | — | branch_admin | MISSING | No departments schema/routes in V5. |
| 44 | Branch admin | Events management | `ad136a0e8f0f41aa8c88c59c77df5455` | `112d23ce9441492cb5edc1c6ef1d5250` | `/branch-admin/content/events` | `/branch-admin/content/events` | `content-admin/entities.ejs` | branch_admin | PLACEHOLDER | |
| 45 | Branch admin | Duty roster | `37bdc9ea66db4ca2b4375d37605bdbb2` | `51d3e5bfce8641f0837a1556d659b6b7` | — | — | — | branch_admin | MISSING | No V5 route/schema. |
| 46 | Branch admin | Website editor | `3f3160664d91423d80cb4ba81e2af6c4` | `f2bb5e794f074a1aa3d248a2fe54ddeb` | `/branch-admin/content` | `/branch-admin/content` | `content-admin/index.ejs` (+ `page.ejs`, `section.ejs`, `preview.ejs`) | branch_admin | PLACEHOLDER | Functional CMS editor; not Stitch website-editor composition. |
| 47 | Branch admin | Announcements | `65941542c13048edb2c62bccd01ddcea` | `daa416025c704a5693b295ef3139af89` | `/branch-admin/announcements` | `/branch-admin/announcements` | `announcements/admin-list.ejs` (+ form/detail/preview/publish) | branch_admin | PARTIAL | Extra form/preview states lack dedicated Stitch pairs. |
| 48 | Branch admin | Attendance tracker | `d351ae0e154f44cd827314e415c0633e` | `5ea15ec1eb9f4fceac664903c1778091` | `/branch-admin/attendance` | `/branch-admin/attendance` | `attendance/admin-list.ejs` | branch_admin | PARTIAL | |
| 49 | Branch admin | Attendance detail | `12e5e7d87c894b059c437a4b38753514` | `18a7d7a77b724653a42882743fb8a736` | `/branch-admin/attendance/:id` | `/branch-admin/attendance/:id` | `attendance/admin-detail.ejs` | branch_admin | PARTIAL | |
| 50 | Branch admin | Giving settings | `858c66cf5d654fffb90c5a264653f27a` | `0769a7e1813d490d921a72a8bc8c3334` | `/branch-admin/giving` | `/branch-admin/giving` | `giving/admin-list.ejs` | branch_admin | PARTIAL | Manual summaries; no bank/QR gateway UI. |
| 51 | Branch admin | Giving summary | `cf849cdb676c48fd8f0f7d38b74c99b0` | `20f32c9e77af423ca6a849a6759add28` | `/branch-admin/giving/:id` | `/branch-admin/giving/:id` | `giving/admin-detail.ejs` | branch_admin | PARTIAL | |
| 52 | Branch admin | Reports dashboard | `d7bdddc0eb244b96a35d6aa6b9bb8f97` | `cc7a0658d477494e9a47c4852b7ed84b` | — | — | — | branch_admin | MISSING | V4 monthly reports not ported to V5 branch UI. |
| 53 | Branch admin | Submit monthly report | `45a88626123b4fc8892ac50244dd561b` | `1be0cd7ef8f8433bbd44c6d1573e495c` | — | — | — | branch_admin | MISSING | |
| 54 | Branch admin | Report history | `5b6ec354f47c4ceda67739b07136a6c0` | `28a3a26278fb4b639b7ffe7bbf408bb1` | — | — | — | branch_admin | MISSING | |
| 55 | Branch admin | Report details | `48955e5ac03442acb363d8d0dd68975e` | `4767ec0f410a4287ba79bdcf049a7cc0` | — | — | — | branch_admin | MISSING | |
| 56 | Branch admin | Request queue | `126bfebff1414fc08367039b84587819` | `9b6531097eec43fb8ce22115dd170429` | `/branch-admin/requests` | `/branch-admin/requests` | `forms-requests/admin-requests.ejs` | branch_admin | PARTIAL | No fabricated queue metrics. |
| 57 | Branch admin | Request details | `22fe4b70e55e4be498d7008741147d55` | `9d8f71d056e54d7da7586d88e253af93` | `/branch-admin/requests/:id` | `/branch-admin/requests/:id` | `forms-requests/admin-request-detail.ejs` | branch_admin | PARTIAL | |
| 58 | Branch admin | Account | — | — | `/branch-admin/account` | `/branch-admin/account` | `branch-admin/account.ejs` | branch_admin | STITCH_MISSING | |
| 59 | Branch admin | Settings | — | — | `/branch-admin/settings` | `/branch-admin/settings` | branch settings via `branch-admin` routes | branch_admin | STITCH_MISSING | |
| 60 | HQ admin | Dashboard | `538c8f4f1a844930ac058428bf390a76` | `c67eda7682de428d985416074f606fcf` | `/hq` | `/hq` | `hq/dashboard.ejs`, `hq-shell-*` | hq_admin | PARTIAL | Live branch count; no fabricated charts/broadcast widgets. |
| 61 | HQ admin | Branch registry | `1a1aaecd09d34357886aa0b1028e539a` | `2f154dfcd0e045938a60ae3c147b240a` | `/hq/branches` | `/hq/branches` | `hq/branches.ejs` | hq_admin | PARTIAL | |
| 62 | HQ admin | Branch performance | `f6b636977d7d40b89bd4048b696a4095` | `922867aec8474f11baff555043b86eea` | `/hq/reports` (approx) | `/hq/reports` | `hq/reports.ejs` | hq_admin | PLACEHOLDER | Aggregates only vs Stitch performance UI. |
| 63 | HQ admin | Consolidated analytics | `2a577dc15d4342acb152f16aed21c267` | `06489c79d0d04a429e57eba5c717ba47` | `/hq/reports` | `/hq/reports` | `hq/reports.ejs` (+ attendance/giving report views) | hq_admin | PLACEHOLDER | Same reports surface; Stitch analytics chrome incomplete. |
| 64 | HQ admin | Audit review queue | `80d249f8fda84958a8a42e458075b19e` | `097ab7191cb645f7b3f135d278ba580f` | `/hq/audit` | `/hq/audit` | `hq/audit.ejs` | hq_admin | PLACEHOLDER | |
| 65 | HQ admin | Global audit trail | `bce1e8ec4078407c8d6179251b8765c2` | `d7fcb1b3a796434a8fefc7e806c2c0b6` | `/hq/audit` | `/hq/audit` | `hq/audit.ejs` | hq_admin | PLACEHOLDER | Shares audit route with queue Stitch. |
| 66 | HQ admin | Monthly reports review | `4404007361f54173a1a9e37ab6285aa5` | `b53425f344804e4681eefb59f3d6cfdd` | — | — | — | hq_admin | MISSING | V4 monthly review workflow not in V5. |
| 67 | HQ admin | Report review detail | `aa7cdf0f1bf349aeaf531dbcccba2eea` | `d03fc656f0ce4c969c7e6fbc6c0a8041` | — | — | — | hq_admin | MISSING | |
| 68 | HQ admin | Permission / roles | `12f5be535eeb49f1a1c5822ae7586504` | `de3e82ef3ad54065a516b042459fdc19` | — | — | — | hq_admin | MISSING | No V5 HQ role-management UI. |
| 69 | HQ admin | Org templates / standards | `df111bee19304663b356561a114c78bc` | `801584edfae5462c829f232ff5c99a4b` | — | — | — | hq_admin | MISSING | |
| 70 | HQ admin | Broadcast center | `ffa76443af8c4aa4ab97086fc8922b73` | `b4184b738eca442d8ca9ff3dbd445bec` | — | — | — | hq_admin | MISSING | |
| 71 | HQ admin | Registrations / members | — | — | `/hq/registrations`, `/hq/members` | `/hq/registrations`, `/hq/members` | `hq/registrations.ejs`, `hq/members.ejs`, detail views | hq_admin | STITCH_MISSING | Functional HQ member admin; no dedicated HQ Stitch pair (branch 26–28 are branch-scoped). |
| 72 | HQ admin | Account / settings | — | — | `/hq/account`, `/hq/settings` | `/hq/account`, `/hq/settings` | `hq/account.ejs`, `hq/settings.ejs` | hq_admin | STITCH_MISSING | |
| 73 | Platform admin | Dashboard | `36c4708b025b4e7eaeab9ed508603b03` | `513dd5cc58c74b21bd7ee8d106dfac55` | `/admin` | `/admin` | `platform-admin/dashboard.ejs`, `platform-admin-shell-*` | platform_admin | PLACEHOLDER | Stitch dark ops chrome vs V5 light shell; no fake health/tickets. |
| 74 | Platform admin | Organizations | `18da9665bc674d2dbd249cbbb269d58d` | `db6b741d99e34d10b01496a83de5072a` | `/admin/organizations` | `/admin/organizations` | `platform-admin/organizations.ejs` | platform_admin | PLACEHOLDER | |
| 75 | Platform admin | Create organization | `d992150d24cb4cd3afdca87ca3ce915f` | `0da4f454abf0402dbe09f82959f29afa` | `/admin/organizations/new` | — | — | platform_admin | MISSING | Provisioning service/CLI exists; no create-org UI route. |
| 76 | Platform admin | Branch tenants / org detail | `10f1dceb6d694563aaf152ecaedac3d3` | `6633fa49f7b9420a8c1705f1e43c9efb` | `/admin/organizations/:key` | `/admin/organizations/:organizationKey` | `platform-admin/organization-detail.ejs` | platform_admin | PLACEHOLDER | |
| 77 | Platform admin | Plans & limits | `4d0f59ac6acf4fcc9e1e0ed746abb5fd` | `b5953809962f4e0a8eae4ea96aa4575a` | `/admin/plans` | `/admin/plans` | `platform-admin/plans.ejs` | platform_admin | PARTIAL | Catalogue + org assign/override; no billing/price invention. |
| 78 | Platform admin | Settings | `30e3856782bd41b6bf14402e1e535cbd` | `efb0fd24f1184968be79083974dcd092` | `/admin/settings` | `/admin/settings` | `platform-admin/settings.ejs` | platform_admin | PARTIAL | Read-only DNS patterns; no save/failover UI. |
| 79 | Platform admin | Support / monitoring | `74cbe4a015754137ad414222f3941ef2` | `9f40042097d7471db1f5628fbb0d27d8` | `/admin/deployments` | `/admin/deployments` | `platform-admin/deployments.ejs` | platform_admin | PLACEHOLDER | Deployment registry only; Stitch tickets/health not inventable. |
| 80 | Platform admin | Account | — | — | `/admin/account` | `/admin/account` | `platform-admin/account.ejs` | platform_admin | STITCH_MISSING | |
| 81 | Shared media | Media library / upload | — | — | `/branch-admin/content/media`, `/hq/content/media` | same | `content-admin/media-upload.ejs`, `media-picker.js`, `media-picker.css` | branch_admin / hq_admin | STITCH_MISSING | Functional media picker/upload present; no dedicated Stitch media-picker screen. |
| 82 | Leader portal (out of V5 scope) | Leader dashboard | `558f95cbc5604764a1b1a58e358f4b27` | `953dfecffd5e4e79bd58e581d49c13c8` | — | — | — | leader | MISSING | No V5 leader role/routes. |
| 83 | Leader portal (out of V5 scope) | Ministry roster | `4b2c2162daa847338b088026a12a536a` | `7c64aefd130f43f3910888d0116afae2` | — | — | — | leader | MISSING | |
| 84 | Leader portal (out of V5 scope) | Record attendance | `5a1fd765d2634bc990a6be831722c803` | `8ea2993615e74de4b8136ef770b784d7` | — | — | — | leader | MISSING | |
| 85 | Leader portal (out of V5 scope) | Submit ministry report | `202f402c811b4975a0da4c39c1e55d22` | `b4ecb0d74f58402ea20f84383b84e821` | — | — | — | leader | MISSING | |
| 86 | Leader portal (out of V5 scope) | Ministry requests | `e18298edd9c742aa82c2c776daaf4272` | `29895b648447493da4f57dce7813b2e1` | — | — | — | leader | MISSING | |
| 87 | Obsolete Stitch (do not build) | Platform branch selector | `297099588171448ab29d1c5c12428103` | `4e0a399dbdf347c4bf69ede48a86e05b` | — | — | — | anon | MISSING | V5 uses hostname tenant resolution, not picker UI. |
| 88 | Obsolete Stitch (superseded) | Platform home (old) | `b025e58ace364a85b3953e669f281b41` | `86682c1ca97c4451858a4cae15940cde` | `/` (apex) | `/` | apex home | anon | NEEDS_VERIFICATION | Superseded by BlessBoard marketing home (order 3). Keep for history only. |
| 89 | Obsolete Stitch (superseded) | Platform church finder (old) | `02a9c170e0314cc8991d4dd9673adef5` | `a1b782aedab445fe98d4634bd698aeab` | `/directory` | — | — | anon | MISSING | Prefer BlessBoard Directory (order 7). |
| 90 | Obsolete Stitch (calendar) | Events calendar UI | `84b919385cfe4ca29a727cf108c887b0` / `25677650abeb4edea23c6a400013dd85` | `0a38bd5bf20a4926865e4d511e0ae2b3` / `26db8f19e5dd467995aa7ead9c8ee87e` | `/events` (calendar) | `/events` (list) | `public/events.ejs` | public | MISSING | Intentional product model: list only. Multiple desktop/mobile calendar IDs. |
| 91 | Shared shells | Tenant public shell | (see orders 13–20) | (see orders 13–20) | tenant public pages | tenant public pages | `partials/tenant-public-shell-start.ejs` / `-end.ejs`, `tenant-public.js`, `shell-nav.js` | public | PARTIAL | |
| 92 | Shared shells | Member shell | (see orders 26–36) | (see orders 26–36) | `/member/*` | `/member/*` | `partials/member-shell-*`, `member-portal.js` | member | PARTIAL | Desktop sidebar + mobile drawer/bottom tabs. |
| 93 | Shared shells | Branch admin shell | `001d1a0235a14f47b456bb092a012f7c` | `615f1f4eabd645c4a6840349edb17cd1` | `/branch-admin/*` | `/branch-admin/*` | `partials/branch-admin-shell-*`, `branch-admin.css` | branch_admin | PARTIAL | Shell chrome from 25-branch-admin-dashboard-* (Batch 11A). No Reports/Support nav. Dashboard content deferred. |
| 94 | Shared shells | HQ shell | (see orders 60–72) | (see orders 60–72) | `/hq/*` | `/hq/*` | `partials/hq-shell-*`, `branch-selector.ejs`, `hq-admin.css` | hq_admin | PARTIAL | |
| 95 | Shared shells | Platform admin shell | (see orders 73–80) | (see orders 73–80) | `/admin/*` | `/admin/*` | `partials/platform-admin-shell-*`, `platform-admin.css` | platform_admin | PLACEHOLDER | |
| 96 | Shared shells | Apex shell | (see orders 3–12) | (see orders 3–12) | apex routes | apex routes | `partials/apex-shell-*`, `apex.js`, `apex.css` | anon / auth | PARTIAL | |

---

## Exact Stitch titles for canonical pairs

| Logical screen | Desktop exact title | Mobile exact title |
|----------------|---------------------|--------------------|
| Apex Home | BlessBoard - One digital home for your church (Desktop) | BlessBoard - One digital home for your church (Mobile) |
| Features | BlessBoard - Features (Desktop) | BlessBoard - Features (Mobile) |
| For Churches | BlessBoard - For Churches (Desktop) | BlessBoard - For Churches (Mobile) |
| Register Church | BlessBoard - Register Your Church (Desktop) | BlessBoard - Register Your Church (Mobile) |
| Directory | BlessBoard - Church Directory (Desktop) | BlessBoard - Church Directory (Mobile) |
| Pricing | BlessBoard - Pricing (Desktop) | BlessBoard - Pricing (Mobile) |
| Pricing FAQ | BlessBoard - Pricing Details & FAQ (Desktop) | BlessBoard - Pricing Details & FAQ (Mobile) |
| Login | 09-auth-member-login-desktop | 09-auth-member-login-mobile |
| Tenant Home | 01-public-home-desktop-v2 (Refined) | 01-public-home-mobile-v2 (Refined) |
| About | 02-public-about-desktop-v3 (Populated) | 02-public-about-mobile-v3 (Populated) |
| Leadership | 03-public-leadership-desktop-v2 (Populated) | 03-public-leadership-mobile-v4 (Restored) |
| Leadership empty | 03-public-leadership-desktop-v2 (Empty) | — (no mobile empty variant) |
| Ministries | 04-public-ministries-desktop-v4 (Populated) | 04-public-ministries-mobile-v4 (Populated) |
| Events | 05-public-events-desktop-v2 (Populated) | 05-public-events-mobile-v2 (Populated) |
| Sermons | 06-public-sermons-desktop-v2 (Populated) | 06-public-sermons-mobile-v2 (Populated) |
| Giving | 07-public-giving-desktop-v2 (Populated) | 07-public-giving-mobile-v2 (Populated) |
| Contact | 08-public-contact-desktop-v2 (Populated) | 08-public-contact-mobile-v2 (Populated) |
| Register | 10-auth-member-registration-desktop | 10-auth-member-registration-mobile |
| Register submitted | 11-auth-registration-submitted-desktop | 11-auth-registration-submitted-mobile |
| Member 14–24 | `NN-member-*-desktop` | `NN-member-*-mobile` (exact titles as in Stitch inventory) |
| Branch 25–45 | `NN-branch-*-desktop` | `NN-branch-*-mobile` |
| HQ 51–61 | `NN-hq-*-desktop` | `NN-hq-*-mobile` |
| Platform 62–68 | `NN-platform-*-desktop` | `NN-platform-*-mobile` |

---

## Gap analysis

### Missing Stitch screens (product gaps designers may still need)

| Gap | Why it matters |
|-----|----------------|
| Dedicated apex `/account` and auth-error screens | Implemented without Stitch targets |
| Media picker / upload dialog | Implemented in V5 (`media-picker.*`); no Stitch pair |
| HQ registrations/members | V5 routes exist; only branch 26–28 Stitch covers similar UX |
| Branch/HQ account & settings | Functional; no Stitch |
| Announcement form / preview / publish states | Extra admin states beyond list Stitch |
| Content-admin entity/page editors as distinct Stitch frames | Website editor Stitch is one frame; V5 has multi-step editor |
| Empty-state mobile for several public pages | Only some Empty variants exist (leadership/events/sermons/giving desktop-heavy) |

### Duplicate or outdated Stitch screens (do not implement)

| Family | IDs / titles | Action |
|--------|--------------|--------|
| Public home base copies | 3× desktop + 3× mobile `01-public-home-*` without v2 | Obsolete → use refined v2 |
| About base / sample | `4537dc72…`, `338e5c78…`, `fa8f1b84…` | Prefer v3 Populated |
| Leadership base + duplicate mobile v2 | `a779e04c…`, `9342690a…`, `025f0ef5…`, `2ca0d27a…` | Prefer populated desktop + v4 Restored mobile |
| Ministries v3 | `67fdba76…`, `ba2fbcfd…` | Prefer v4 Populated |
| Sermons resources base | `ebe20757…`, `5902746f…` | Prefer v2 Populated |
| Giving information base | `14115440…`, `5b65875a…` | Prefer v2 Populated |
| Contact base | `6d4d6ae2…`, `8f6f1528…` | Prefer v2 Populated |
| Branch dashboard 04-* | `969acd6c…`, `c5791e66…` | Prefer 25-* |
| Platform home / finder / branch selector | see orders 87–89 | Hostname model + BlessBoard marketing set |

### Desktop / mobile inconsistencies

| Finding | Detail |
|---------|--------|
| Leadership empty | Desktop empty ID only; no mobile empty variant |
| About sample | Desktop-only `02-public-about-sample-desktop` |
| Design boards | Mostly desktop or unspecified device; header refs split D/M |
| Events empty / sermons empty | Desktop empty variants; mobile empty not always present |
| Member forms | Both D+M exist in live Stitch (unlike older PNG inventory) |
| Stitch nav length | Often shorter than V5 full CMS nav — intentional V5 difference |

### Missing V5 routes (Stitch exists)

`/features`, `/for-churches`, `/register-church`, `/directory`, `/pricing`, waiting-verification, forgot-password, `/member/prayer-request`, departments, duty roster, branch monthly reports (40–43), HQ monthly review (54–55), HQ roles/templates/broadcast (59–61), `/admin/organizations/new`, leader portal (46–50), branch-selector UI.

### V5 routes without Stitch designs (STITCH_MISSING)

`/account`, auth-error, `/branch-admin/account`, `/branch-admin/settings`, `/hq/account`, `/hq/settings`, `/hq/registrations` (+ detail), `/hq/members` (+ detail), `/admin/account`, content media upload/picker, many admin form/preview states, foundation tenant landing.

### Material Stitch ↔ implementation differences (still PARTIAL)

| Surface | Difference |
|---------|------------|
| Apex home | Stitch Features/Pricing/Register nav & inset hero vs V5 Home/Login + full-bleed |
| Tenant home | Stitch demo widgets/metrics vs CMS-only published sections |
| Login | Stitch centered tenant card + forgot link vs apex dual-pane transfer auth |
| Events | Stitch calendar frames vs list |
| Branch/HQ/Platform dashboards | Stitch fabricated analytics vs live counts only |
| Platform shell | Stitch dark ops aesthetic vs light Sacred Modernity shell |

---

## Appendix A — complete raw Stitch inventory (196)

All IDs from live MCP `list_screens` on `17124191473876947591`. Primary targets are listed in the master table; this appendix is the audit trail.

<details>
<summary>Full ID list (title · device · id)</summary>

```
01-platform-branch-selector-desktop · DESKTOP · 297099588171448ab29d1c5c12428103
01-platform-branch-selector-mobile · MOBILE · 4e0a399dbdf347c4bf69ede48a86e05b
01-platform-church-finder-desktop · DESKTOP · 02a9c170e0314cc8991d4dd9673adef5
01-platform-church-finder-mobile · MOBILE · a1b782aedab445fe98d4634bd698aeab
01-platform-home-desktop · DESKTOP · b025e58ace364a85b3953e669f281b41
01-platform-home-mobile · MOBILE · 86682c1ca97c4451858a4cae15940cde
01-public-home-desktop · DESKTOP · 7cb68d969f1e4b718e5870a0dd60523e
01-public-home-desktop · DESKTOP · f5b04bfbdd8b452f912cf45aa1d66992
01-public-home-desktop · DESKTOP · ff5da3e58cff4525a6ed972dcfc6f1d8
01-public-home-desktop-v2 (Refined) · DESKTOP · ead45db5be774baa9454412262096ffc
01-public-home-mobile · MOBILE · 221636e594a1490d92ef27189748b172
01-public-home-mobile · MOBILE · a3ec4058c4024e35a18e471960d748e8
01-public-home-mobile · MOBILE · a52e64c6e9b743c8857cf7ab5cd907f6
01-public-home-mobile-v2 (Refined) · MOBILE · 89177588fbf8405dbebd5747c38e19ce
02-public-about-desktop · DESKTOP · 4537dc7257cb47a39fa0af4ee1c1c316
02-public-about-desktop-v3 (Populated) · DESKTOP · 44492f6abbe849d0a8a89303ce83129b
02-public-about-mobile · MOBILE · 338e5c78ba2148669d1a20e626a43969
02-public-about-mobile-v3 (Populated) · MOBILE · 3f0b8a5c30544d9495064df8d5f9e62e
02-public-about-sample-desktop (New Design System) · DESKTOP · fa8f1b8479fd437c8c8a9ba138cbe372
03-public-leadership-desktop · DESKTOP · a779e04c4e28497ba4d5fb1e5fd8a5fe
03-public-leadership-desktop-v2 (Empty) · DESKTOP · 5f7b1d44bd454d45a0b72fb76d94bbd0
03-public-leadership-desktop-v2 (Populated) · DESKTOP · 372faa60f8df4983b627db3cb5d35f9d
03-public-leadership-mobile · MOBILE · 9342690a6b8644039395a0fb801d8be6
03-public-leadership-mobile-v2 (Populated) · MOBILE · 025f0ef58e2f4443a60458aec0b1cc5e
03-public-leadership-mobile-v2 (Populated) · MOBILE · 2ca0d27a78f64b9f844a0251ca4e6bd4
03-public-leadership-mobile-v4 (Restored) · MOBILE · 0f4e816fd64d4592bd3677fbde3b7544
04-branch-admin-dashboard-desktop · DESKTOP · 969acd6c2f954d9ba10c02f842b54885
04-branch-admin-dashboard-mobile · MOBILE · c5791e6667c549488c64606ef8e92217
04-public-ministries-desktop-v3 · DESKTOP · 67fdba7676b549e493e39a83014fe4cf
04-public-ministries-desktop-v4 (Populated) · DESKTOP · f146cdccadb34ff3bd8b0b75a0450d15
04-public-ministries-mobile-v3 · MOBILE · ba2fbcfd2db04fe495b873e418c233e0
04-public-ministries-mobile-v4 (Populated) · MOBILE · d2fd7ecc586541d3beb5d0d3bed98d56
05-public-events-calendar-desktop · DESKTOP · 84b919385cfe4ca29a727cf108c887b0
05-public-events-calendar-desktop-v2 · DESKTOP · 25677650abeb4edea23c6a400013dd85
05-public-events-calendar-mobile · MOBILE · 0a38bd5bf20a4926865e4d511e0ae2b3
05-public-events-calendar-mobile-v2 · MOBILE · 26db8f19e5dd467995aa7ead9c8ee87e
05-public-events-desktop-v2 (Empty) · DESKTOP · 6c3a2b460ac54e6a88336af9085e8c38
05-public-events-desktop-v2 (Populated) · DESKTOP · 6f618576f0304982bd239bfe04946e72
05-public-events-mobile-v2 (Populated) · MOBILE · f58c416cbbd545429258d963b3a15b60
06-public-sermons-desktop-v2 (Empty) · DESKTOP · 0c7262cdda4547739ec0c1fa5128fb51
06-public-sermons-desktop-v2 (Populated) · DESKTOP · 4f4995dc4ec84354ac80ed022a767ef3
06-public-sermons-mobile-v2 (Populated) · MOBILE · 96b380d4e47649c1bd7f05cabe9c3a1d
06-public-sermons-resources-desktop · DESKTOP · ebe20757fa8247adb7b8f1dec4b06c4e
06-public-sermons-resources-mobile · MOBILE · 5902746feee944089204f99023ca38c0
07-public-giving-desktop-v2 (Empty) · DESKTOP · a08093b9ec32467bad300ef43ac800fa
07-public-giving-desktop-v2 (Populated) · DESKTOP · 59c8fdedf68a43e3a5d2384b0c2212df
07-public-giving-information-desktop · DESKTOP · 141154401aff48b79f0ffd3d3bcd8bc6
07-public-giving-information-mobile · MOBILE · 5b65875aab7e4728af72f3d12ba06116
07-public-giving-mobile-v2 (Populated) · MOBILE · a0616f23568c464a95eda9e317e2fa9d
08-public-contact-desktop · DESKTOP · 6d4d6ae29bc2405b9211131b1ccab287
08-public-contact-desktop-v2 (Populated) · DESKTOP · ab93d842bf2e49caa838a1fd414eb35b
08-public-contact-mobile · MOBILE · 8f6f1528517b450c910ebac12ff89bd0
08-public-contact-mobile-v2 (Populated) · MOBILE · 9cbad6aacb6246549913e275f228fa80
09-auth-member-login-desktop · DESKTOP · 9b264ef3081f4b5aab493d9b9710b00b
09-auth-member-login-mobile · MOBILE · 68a84bcc8dff4f4ca5836216c22a2e6a
10-auth-member-registration-desktop · DESKTOP · c360aef636d341a8ad3eb47c4c2e5c21
10-auth-member-registration-mobile · MOBILE · 7d77190575b54d1b8277726570aec1c4
11-auth-registration-submitted-desktop · DESKTOP · 1d37704351d6425ca872f8803322175c
11-auth-registration-submitted-mobile · MOBILE · f222e55152c349cc880548037aa7d540
12-auth-waiting-verification-desktop · DESKTOP · 239beae5140e44aeb34ba7034260cd5b
12-auth-waiting-verification-mobile · MOBILE · 8e6e504fcfa6452f9f3a719da33527fe
13-auth-forgot-password-desktop · DESKTOP · 61a6861b34aa4c5390d4103b9d4da7b7
13-auth-forgot-password-mobile · MOBILE · f4bb9457291d44d0ac8be0ab5017d9a0
14-member-dashboard-desktop · DESKTOP · 4207a5a6a8ac4464b2b899695bbc7c78
14-member-dashboard-mobile · MOBILE · b315a9d1288b4454bcc37f79c25c5e10
15-member-profile-desktop · DESKTOP · a323f678460c4d62bfe1a8de462f58e1
15-member-profile-mobile · MOBILE · 55e21b658b57471db74eccd77e386079
16-member-announcements-desktop · DESKTOP · 63a9e6139ffd41f19b6b6d2f090f0199
16-member-announcements-mobile · MOBILE · d7074e7cfd7048c98abb960826673c01
17-member-events-calendar-desktop · DESKTOP · 9a52685310ce4231bd9767ee3257c906
17-member-events-calendar-mobile · MOBILE · a4dc4a494cc54143b76671bd89cdaa69
18-member-my-ministries-desktop · DESKTOP · 05f9bdca09fd456595a15b963be8092a
18-member-my-ministries-mobile · MOBILE · 53924d7ece3e46e79d84556e56335b6e
19-member-resources-study-desktop · DESKTOP · d1690ab7193d43e38ba9ba97c29d914c
19-member-resources-study-mobile · MOBILE · d3232a4f5e0f4d2da610740ca3a8f6b1
20-member-forms-documents-desktop · DESKTOP · 745a1972c0ba4ec893f64cc3457c0c95
20-member-forms-documents-mobile · MOBILE · 0f801e19ed3d4332bee877001bdc1a13
21-member-submit-online-request-desktop · DESKTOP · 2cfd58a5ea094831a3a44eed73c44165
21-member-submit-online-request-mobile · MOBILE · 196260bada8445d5b107f4be552540dc
22-member-request-status-desktop · DESKTOP · 530cb58f684646b9b084f45eb2e17e90
22-member-request-status-mobile · MOBILE · 6c5f8b31ee394643a69dd7fe01c3e67e
23-member-submit-prayer-request-desktop · DESKTOP · 57edf48979d04b6d8647474961b48acb
23-member-submit-prayer-request-mobile · MOBILE · 1dd180a3c5c5463988cb96dde2b44d37
24-member-giving-information-desktop · DESKTOP · 3e72367008054943b23f6c690bac8eea
24-member-giving-information-mobile · MOBILE · 236d4bf2f588459f8cde18bd164b09cd
25-branch-admin-dashboard-desktop · DESKTOP · 001d1a0235a14f47b456bb092a012f7c
25-branch-admin-dashboard-mobile · MOBILE · 615f1f4eabd645c4a6840349edb17cd1
26-branch-member-verification-queue-desktop · DESKTOP · 87fe9bb70b79434e88b91e0fd877d238
26-branch-member-verification-queue-mobile · MOBILE · d352ed076bbe4fabb1ad6f5ef66c0a25
27-branch-member-profile-desktop · DESKTOP · 5e5985a087d049109c49006f99095884
27-branch-member-profile-mobile · MOBILE · b3fbd9e2eda64a2b998ec0e2a4311229
28-branch-member-directory-desktop · DESKTOP · 3dae337c97e242049670749c2b1ab09d
28-branch-member-directory-mobile · MOBILE · e90963b00bcf41368d089053a3a5db07
29-branch-ministries-directory-desktop · DESKTOP · 58c96b4c5b554e6991fc080c63783b6c
29-branch-ministries-directory-mobile · MOBILE · 526c14042cb045fd8c2cfcb568e2c8ae
30-branch-ministry-profile-desktop · DESKTOP · 064769bb18ab455fb2a39adf2f3c080a
30-branch-ministry-profile-mobile · MOBILE · 17509b0d718346daaf4ac3b6c6f29d42
31-branch-departments-directory-desktop · DESKTOP · 7ee4d401f26d45b8ae18f26fe9b391ec
31-branch-departments-directory-mobile · MOBILE · 3794bd0c398b42cbb3987964807b27c3
32-branch-events-management-desktop · DESKTOP · ad136a0e8f0f41aa8c88c59c77df5455
32-branch-events-management-mobile · MOBILE · 112d23ce9441492cb5edc1c6ef1d5250
33-branch-duty-roster-desktop · DESKTOP · 37bdc9ea66db4ca2b4375d37605bdbb2
33-branch-duty-roster-mobile · MOBILE · 51d3e5bfce8641f0837a1556d659b6b7
34-branch-website-editor-desktop · DESKTOP · 3f3160664d91423d80cb4ba81e2af6c4
34-branch-website-editor-mobile · MOBILE · f2bb5e794f074a1aa3d248a2fe54ddeb
35-branch-announcements-management-desktop · DESKTOP · 65941542c13048edb2c62bccd01ddcea
35-branch-announcements-management-mobile · MOBILE · daa416025c704a5693b295ef3139af89
36-branch-attendance-tracker-desktop · DESKTOP · d351ae0e154f44cd827314e415c0633e
36-branch-attendance-tracker-mobile · MOBILE · 5ea15ec1eb9f4fceac664903c1778091
37-branch-attendance-record-detail-desktop · DESKTOP · 12e5e7d87c894b059c437a4b38753514
37-branch-attendance-record-detail-mobile · MOBILE · 18a7d7a77b724653a42882743fb8a736
38-branch-giving-settings-desktop · DESKTOP · 858c66cf5d654fffb90c5a264653f27a
38-branch-giving-settings-mobile · MOBILE · 0769a7e1813d490d921a72a8bc8c3334
39-branch-giving-summary-desktop · DESKTOP · cf849cdb676c48fd8f0f7d38b74c99b0
39-branch-giving-summary-mobile · MOBILE · 20f32c9e77af423ca6a849a6759add28
40-branch-reports-dashboard-desktop · DESKTOP · d7bdddc0eb244b96a35d6aa6b9bb8f97
40-branch-reports-dashboard-mobile · MOBILE · cc7a0658d477494e9a47c4852b7ed84b
41-branch-submit-monthly-report-desktop · DESKTOP · 45a88626123b4fc8892ac50244dd561b
41-branch-submit-monthly-report-mobile · MOBILE · 1be0cd7ef8f8433bbd44c6d1573e495c
42-branch-report-history-desktop · DESKTOP · 5b6ec354f47c4ceda67739b07136a6c0
42-branch-report-history-mobile · MOBILE · 28a3a26278fb4b639b7ffe7bbf408bb1
43-branch-report-details-desktop · DESKTOP · 48955e5ac03442acb363d8d0dd68975e
43-branch-report-details-mobile · MOBILE · 4767ec0f410a4287ba79bdcf049a7cc0
44-branch-request-workflow-queue-desktop · DESKTOP · 126bfebff1414fc08367039b84587819
44-branch-request-workflow-queue-mobile · MOBILE · 9b6531097eec43fb8ce22115dd170429
45-branch-request-details-desktop · DESKTOP · 22fe4b70e55e4be498d7008741147d55
45-branch-request-details-mobile · MOBILE · 9d8f71d056e54d7da7586d88e253af93
46-leader-dashboard-desktop · DESKTOP · 558f95cbc5604764a1b1a58e358f4b27
46-leader-dashboard-mobile · MOBILE · 953dfecffd5e4e79bd58e581d49c13c8
47-leader-ministry-roster-desktop · DESKTOP · 4b2c2162daa847338b088026a12a536a
47-leader-ministry-roster-mobile · MOBILE · 7c64aefd130f43f3910888d0116afae2
48-leader-record-attendance-desktop · DESKTOP · 5a1fd765d2634bc990a6be831722c803
48-leader-record-attendance-mobile · MOBILE · 8ea2993615e74de4b8136ef770b784d7
49-leader-submit-ministry-report-desktop · DESKTOP · 202f402c811b4975a0da4c39c1e55d22
49-leader-submit-ministry-report-mobile · MOBILE · b4ecb0d74f58402ea20f84383b84e821
50-leader-ministry-requests-desktop · DESKTOP · e18298edd9c742aa82c2c776daaf4272
50-leader-ministry-requests-mobile · MOBILE · 29895b648447493da4f57dce7813b2e1
51-hq-dashboard-desktop · DESKTOP · 538c8f4f1a844930ac058428bf390a76
51-hq-dashboard-mobile · MOBILE · c67eda7682de428d985416074f606fcf
52-hq-branch-registry-desktop · DESKTOP · 1a1aaecd09d34357886aa0b1028e539a
52-hq-branch-registry-mobile · MOBILE · 2f154dfcd0e045938a60ae3c147b240a
53-hq-branch-performance-desktop · DESKTOP · f6b636977d7d40b89bd4048b696a4095
53-hq-branch-performance-mobile · MOBILE · 922867aec8474f11baff555043b86eea
54-hq-monthly-reports-review-desktop · DESKTOP · 4404007361f54173a1a9e37ab6285aa5
54-hq-monthly-reports-review-mobile · MOBILE · b53425f344804e4681eefb59f3d6cfdd
55-hq-report-review-detail-desktop · DESKTOP · aa7cdf0f1bf349aeaf531dbcccba2eea
55-hq-report-review-detail-mobile · MOBILE · d03fc656f0ce4c969c7e6fbc6c0a8041
56-hq-audit-review-queue-desktop · DESKTOP · 80d249f8fda84958a8a42e458075b19e
56-hq-audit-review-queue-mobile · MOBILE · 097ab7191cb645f7b3f135d278ba580f
57-hq-consolidated-analytics-desktop · DESKTOP · 2a577dc15d4342acb152f16aed21c267
57-hq-consolidated-analytics-mobile · MOBILE · 06489c79d0d04a429e57eba5c717ba47
58-hq-global-audit-trail-desktop · DESKTOP · bce1e8ec4078407c8d6179251b8765c2
58-hq-global-audit-trail-mobile · MOBILE · d7fcb1b3a796434a8fefc7e806c2c0b6
59-hq-permission-role-management-desktop · DESKTOP · 12f5be535eeb49f1a1c5822ae7586504
59-hq-permission-role-management-mobile · MOBILE · de3e82ef3ad54065a516b042459fdc19
60-hq-organization-templates-standards-desktop · DESKTOP · df111bee19304663b356561a114c78bc
60-hq-organization-templates-standards-mobile · MOBILE · 801584edfae5462c829f232ff5c99a4b
61-hq-broadcast-center-desktop · DESKTOP · ffa76443af8c4aa4ab97086fc8922b73
61-hq-broadcast-center-mobile · MOBILE · b4184b738eca442d8ca9ff3dbd445bec
62-platform-admin-dashboard-desktop · DESKTOP · 36c4708b025b4e7eaeab9ed508603b03
62-platform-admin-dashboard-mobile · MOBILE · 513dd5cc58c74b21bd7ee8d106dfac55
63-platform-church-organizations-desktop · DESKTOP · 18da9665bc674d2dbd249cbbb269d58d
63-platform-church-organizations-mobile · MOBILE · db6b741d99e34d10b01496a83de5072a
64-platform-create-church-organization-desktop · DESKTOP · d992150d24cb4cd3afdca87ca3ce915f
64-platform-create-church-organization-mobile · MOBILE · 0da4f454abf0402dbe09f82959f29afa
65-platform-branch-tenants-desktop · DESKTOP · 10f1dceb6d694563aaf152ecaedac3d3
65-platform-branch-tenants-mobile · MOBILE · 6633fa49f7b9420a8c1705f1e43c9efb
66-platform-plans-limits-desktop · DESKTOP · 4d0f59ac6acf4fcc9e1e0ed746abb5fd
66-platform-plans-limits-mobile · MOBILE · b5953809962f4e0a8eae4ea96aa4575a
67-platform-settings-desktop · DESKTOP · 30e3856782bd41b6bf14402e1e535cbd
67-platform-settings-mobile · MOBILE · efb0fd24f1184968be79083974dcd092
68-platform-support-monitoring-desktop · DESKTOP · 74cbe4a015754137ad414222f3941ef2
68-platform-support-monitoring-mobile · MOBILE · 9f40042097d7471db1f5628fbb0d27d8
[favicon prompt] · 1024 · e2d6dccfc9814eafb6bd9661ee348194
BlessBoard - Church Directory (Desktop) · DESKTOP · 2b9df962f4ff4b4e8a45be51f99a5497
BlessBoard - Church Directory (Mobile) · MOBILE · ab5d47e2d6c54065a4eb66c906d3c39c
BlessBoard - Desktop Header Reference · DESKTOP · 43d6d1cb110240c8aa7e5989386ea63b
BlessBoard - Features (Desktop) · DESKTOP · 7ef3518f23a0400098d810f617dd0cc0
BlessBoard - Features (Mobile) · MOBILE · 5ac1e1b0600b4bc78f945e36b56aaece
BlessBoard - For Churches (Desktop) · DESKTOP · fc4bf5aab5bb4737a56d72030bae8803
BlessBoard - For Churches (Mobile) · MOBILE · 55af3450069944598d9f0ce17df12da6
BlessBoard - Mobile Header Reference · MOBILE · 2d430d9648cc404b88f7463e170aa3b5
BlessBoard - One digital home for your church (Desktop) · DESKTOP · 46081ff8f3d04090b9de33020bdf1530
BlessBoard - One digital home for your church (Mobile) · MOBILE · 9f9927a608024e4ebaae11f13e68bdc5
BlessBoard - Pricing (Desktop) · DESKTOP · 1c50e8987d9043ec941b07fb0f67cef5
BlessBoard - Pricing (Mobile) · MOBILE · 181ec1f8076c4ae7ad6be92d5a4861f3
BlessBoard - Pricing Details & FAQ (Desktop) · DESKTOP · c47840e7030c449a94c4ce4a03fa932f
BlessBoard - Pricing Details & FAQ (Mobile) · MOBILE · 65067eb3ebfe45b2a810531334c54684
BlessBoard - Register Your Church (Desktop) · DESKTOP · 8640e8531e7144c3a048617592979cb7
BlessBoard - Register Your Church (Mobile) · MOBILE · 515da582d2504feaaa00c03b7a2e77e1
BlessBoard Church Logo · 1024 · 59da7230441e46d387320a2b6ef32f5c
BlessBoard Logo & Header Spec · DESKTOP · 7880f0e354c445729cc01125f1526603
BlessBoard Powered by GetPro Logo · 1376 · 503ff0d768f04d1db68b72ce309b040c
BlessBoard Public Visual System Board · DESKTOP · 8f689e44024444839a9c3174f03d4101
BlessBoard Shared UI States Board · DESKTOP · b61a1ea8176648408211b681e942e0a6
BlessBoard Visual System Specification · DESKTOP · c8d8352b1b95400cb25e32a79c2f0b2e
```

</details>

---

## Appendix B — design / asset boards (reference only)

| Exact title | Stitch ID | Device | V5 usage |
|-------------|-----------|--------|----------|
| BlessBoard Visual System Specification | `c8d8352b1b95400cb25e32a79c2f0b2e` | DESKTOP | Tokens / Sacred Modernity |
| BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` | DESKTOP | Empty/error/loading/form states |
| BlessBoard Public Visual System Board | `8f689e44024444839a9c3174f03d4101` | DESKTOP | Public visual reference |
| BlessBoard Logo & Header Spec | `7880f0e354c445729cc01125f1526603` | DESKTOP | Header lockup |
| BlessBoard - Desktop Header Reference | `43d6d1cb110240c8aa7e5989386ea63b` | DESKTOP | Header |
| BlessBoard - Mobile Header Reference | `2d430d9648cc404b88f7463e170aa3b5` | MOBILE | Header |
| BlessBoard Church Logo | `59da7230441e46d387320a2b6ef32f5c` | — | Logo asset |
| BlessBoard Powered by GetPro Logo | `503ff0d768f04d1db68b72ce309b040c` | — | `partials/powered-by-getpro.ejs` |
| Favicon-style church icon prompt | `e2d6dccfc9814eafb6bd9661ee348194` | — | Favicon / mark |

---

*Permanent map generated from live Stitch MCP + V5 route/view inspection. Prefer this file for GUI batch planning going forward.*
