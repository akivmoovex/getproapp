# BlessBoard V5 ↔ Stitch screen map

**Date:** 2026-07-18  
**Stitch project:** `projects/17124191473876947591` (GetPro Church Platform) via live MCP `list_screens`  
**Constraint:** Audit only — no implementation edits in this pass.  
**Sources of truth:** (1) Stitch visuals (2) V5 routes/services/security (3) V4 wording/layout reference only.

## Summary

| Metric | Count |
|--------|------:|
| Stitch screens (MCP) | 196 |
| Status exact | 0 |
| Status close | 26 |
| Status placeholder | 62 |
| Status missing | 64 |
| Status obsolete | 44 |

**Canonical rule:** Prefer populated / refined / restored variants. Older duplicates marked **obsolete**. Empty variants are empty-state references (status **close** intent for empty UI, not product routes).

**Status meanings:** `exact` visual+data parity · `close` Stitch layout wired with known token/field gaps · `placeholder` V5 functional shell without Stitch chrome · `missing` no V5 route/view · `obsolete` superseded Stitch variant or incompatible product model.

## 1. Apex public

_20 screens_

| Screen name | Stitch ID | Device | Intended route | Role | Current V5 view | Related V4 view | Status | Backend route | Backend service | Data dependency | Required asset | Shared shell | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01-platform-branch-selector-desktop — V5 uses hostname tenant resolution, not picker UI | 297099588171448ab29d1c5c12428103 | Desktop | — | anon | — | — | obsolete | No | No | — | — | — | — |
| 01-platform-branch-selector-mobile — V5 uses hostname tenant resolution, not picker UI | 4e0a399dbdf347c4bf69ede48a86e05b | Mobile | — | anon | — | — | obsolete | No | No | — | — | — | — |
| 01-platform-church-finder-desktop | 02a9c170e0314cc8991d4dd9673adef5 | Desktop | /directory | anon | — | church directory views | missing | No | Partial (hostname catalogue) | platform org directory | — | apex marketing shell (new) | B5 Apex marketing |
| 01-platform-church-finder-mobile | a1b782aedab445fe98d4634bd698aeab | Mobile | /directory | anon | — | church directory views | missing | No | Partial (hostname catalogue) | platform org directory | — | apex marketing shell (new) | B5 Apex marketing |
| 01-platform-home-desktop — Superseded by BlessBoard marketing home | b025e58ace364a85b3953e669f281b41 | Desktop | / (apex) | anon | renderFoundationHome | — | obsolete | Yes | No | — | — | apex | — |
| 01-platform-home-mobile — Superseded by BlessBoard marketing home | 86682c1ca97c4451858a4cae15940cde | Mobile | / (apex) | anon | renderFoundationHome | — | obsolete | Yes | No | — | — | apex | — |
| BlessBoard - Church Directory (Desktop) | 2b9df962f4ff4b4e8a45be51f99a5497 | Desktop | /directory | anon | — | church directory views | missing | No | Partial (hostname catalogue) | platform org directory | — | apex marketing shell (new) | B5 Apex marketing |
| BlessBoard - Church Directory (Mobile) | ab5d47e2d6c54065a4eb66c906d3c39c | Mobile | /directory | anon | — | church directory views | missing | No | Partial (hostname catalogue) | platform org directory | — | apex marketing shell (new) | B5 Apex marketing |
| BlessBoard - Features (Desktop) | 7ef3518f23a0400098d810f617dd0cc0 | Desktop | /features | anon | — | —(V4 apex chrome) | missing | No | No | static | — | apex marketing shell (new) | B5 Apex marketing |
| BlessBoard - Features (Mobile) | 5ac1e1b0600b4bc78f945e36b56aaece | Mobile | /features | anon | — | —(V4 apex chrome) | missing | No | No | static | — | apex marketing shell (new) | B5 Apex marketing |
| BlessBoard - For Churches (Desktop) | fc4bf5aab5bb4737a56d72030bae8803 | Desktop | /for-churches | anon | — | — | missing | No | No | — | — | apex marketing shell (new) | B5 Apex marketing |
| BlessBoard - For Churches (Mobile) | 55af3450069944598d9f0ce17df12da6 | Mobile | /for-churches | anon | — | — | missing | No | No | — | — | apex marketing shell (new) | B5 Apex marketing |
| BlessBoard - One digital home for your church (Desktop) | 46081ff8f3d04090b9de33020bdf1530 | Desktop | / (apex) | anon | apex/home.ejs | church/public/home_apex.ejs | close | Yes | Partial | none | marketing hero | apex bb-v5-shell | Done B5 apex home |
| BlessBoard - One digital home for your church (Mobile) | 9f9927a608024e4ebaae11f13e68bdc5 | Mobile | / (apex) | anon | apex/home.ejs | church/public/home_apex.ejs | close | Yes | Partial | none | marketing hero | apex bb-v5-shell | Done B5 apex home |
| BlessBoard - Pricing (Desktop) | 1c50e8987d9043ec941b07fb0f67cef5 | Desktop | /pricing | anon | — | — | missing | No | No | — | — | apex marketing shell (new) | B5 Apex marketing |
| BlessBoard - Pricing (Mobile) | 181ec1f8076c4ae7ad6be92d5a4861f3 | Mobile | /pricing | anon | — | — | missing | No | No | — | — | apex marketing shell (new) | B5 Apex marketing |
| BlessBoard - Pricing Details & FAQ (Desktop) | c47840e7030c449a94c4ce4a03fa932f | Desktop | /pricing#faq | anon | — | — | missing | No | No | — | — | apex marketing shell (new) | B5 Apex marketing |
| BlessBoard - Pricing Details & FAQ (Mobile) | 65067eb3ebfe45b2a810531334c54684 | Mobile | /pricing#faq | anon | — | — | missing | No | No | — | — | apex marketing shell (new) | B5 Apex marketing |
| BlessBoard - Register Your Church (Desktop) | 8640e8531e7144c3a048617592979cb7 | Desktop | /register-church | anon | — | — | missing | No | No | — | — | apex marketing shell (new) | B5 Apex marketing |
| BlessBoard - Register Your Church (Mobile) | 515da582d2504feaaa00c03b7a2e77e1 | Mobile | /register-church | anon | — | — | missing | No | No | — | — | apex marketing shell (new) | B5 Apex marketing |

## 2. Apex authentication

_2 screens_

| Screen name | Stitch ID | Device | Intended route | Role | Current V5 view | Related V4 view | Status | Backend route | Backend service | Data dependency | Required asset | Shared shell | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 09-auth-member-login-desktop — Tenant never renders password form | 9b264ef3081f4b5aab493d9b9710b00b | Desktop | /login (apex; tenant redirects) | anon | apex/login.ejs | church/auth/login.ejs | close ★canon | Yes | Yes | auth transfer + session | — | apex-auth | Done Auth GUI |
| 09-auth-member-login-mobile — Tenant never renders password form | 68a84bcc8dff4f4ca5836216c22a2e6a | Mobile | /login (apex; tenant redirects) | anon | apex/login.ejs | church/auth/login.ejs | close ★canon | Yes | Yes | auth transfer + session | — | apex-auth | Done Auth GUI |

## 3. Tenant public

_45 screens_

| Screen name | Stitch ID | Device | Intended route | Role | Current V5 view | Related V4 view | Status | Backend route | Backend service | Data dependency | Required asset | Shared shell | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01-public-home-desktop — Prefer refined v2 | ff5da3e58cff4525a6ed972dcfc6f1d8 | Desktop | / (tenant) | public | public/home.ejs via page.ejs | church/public/home.ejs | obsolete | Yes | Yes | published page_sections | hero mediaUrl / mesh | tenant-public-shell | — |
| 01-public-home-desktop — Prefer refined v2 | 7cb68d969f1e4b718e5870a0dd60523e | Desktop | / (tenant) | public | public/home.ejs via page.ejs | church/public/home.ejs | obsolete | Yes | Yes | published page_sections | hero mediaUrl / mesh | tenant-public-shell | — |
| 01-public-home-desktop — Prefer refined v2 | f5b04bfbdd8b452f912cf45aa1d66992 | Desktop | / (tenant) | public | public/home.ejs via page.ejs | church/public/home.ejs | obsolete | Yes | Yes | published page_sections | hero mediaUrl / mesh | tenant-public-shell | — |
| 01-public-home-desktop-v2 (Refined) | ead45db5be774baa9454412262096ffc | Desktop | / (tenant) | public | public/home.ejs via page.ejs | church/public/home.ejs | close ★canon | Yes | Yes | published page_sections | hero mediaUrl / mesh | tenant-public-shell | Done B1–B2 |
| 01-public-home-mobile — Prefer refined v2 | 221636e594a1490d92ef27189748b172 | Mobile | / (tenant) | public | public/home.ejs via page.ejs | church/public/home.ejs | obsolete | Yes | Yes | published page_sections | hero mediaUrl / mesh | tenant-public-shell | — |
| 01-public-home-mobile — Prefer refined v2 | a3ec4058c4024e35a18e471960d748e8 | Mobile | / (tenant) | public | public/home.ejs via page.ejs | church/public/home.ejs | obsolete | Yes | Yes | published page_sections | hero mediaUrl / mesh | tenant-public-shell | — |
| 01-public-home-mobile — Prefer refined v2 | a52e64c6e9b743c8857cf7ab5cd907f6 | Mobile | / (tenant) | public | public/home.ejs via page.ejs | church/public/home.ejs | obsolete | Yes | Yes | published page_sections | hero mediaUrl / mesh | tenant-public-shell | — |
| 01-public-home-mobile-v2 (Refined) | 89177588fbf8405dbebd5747c38e19ce | Mobile | / (tenant) | public | public/home.ejs via page.ejs | church/public/home.ejs | close ★canon | Yes | Yes | published page_sections | hero mediaUrl / mesh | tenant-public-shell | Done B1–B2 |
| 02-public-about-desktop | 4537dc7257cb47a39fa0af4ee1c1c316 | Desktop | /about | public | public/about.ejs | church/public/about.ejs | obsolete | Yes | Yes | published sections | — | tenant-public-shell | Done B1–B2 |
| 02-public-about-desktop-v3 (Populated) | 44492f6abbe849d0a8a89303ce83129b | Desktop | /about | public | public/about.ejs | church/public/about.ejs | close ★canon | Yes | Yes | published sections | — | tenant-public-shell | Done B1–B2 |
| 02-public-about-mobile | 338e5c78ba2148669d1a20e626a43969 | Mobile | /about | public | public/about.ejs | church/public/about.ejs | obsolete | Yes | Yes | published sections | — | tenant-public-shell | Done B1–B2 |
| 02-public-about-mobile-v3 (Populated) | 3f0b8a5c30544d9495064df8d5f9e62e | Mobile | /about | public | public/about.ejs | church/public/about.ejs | close ★canon | Yes | Yes | published sections | — | tenant-public-shell | Done B1–B2 |
| 02-public-about-sample-desktop (New Design System) | fa8f1b8479fd437c8c8a9ba138cbe372 | Desktop | /about | public | public/about.ejs | church/public/about.ejs | obsolete | Yes | Yes | published sections | — | tenant-public-shell | — |
| 03-public-leadership-desktop | a779e04c4e28497ba4d5fb1e5fd8a5fe | Desktop | /leadership | public | public/leadership.ejs | church/public/leadership.ejs | obsolete | Yes | Yes | published leaders | leader imageUrl | tenant-public-shell | Done B2 |
| 03-public-leadership-desktop-v2 (Empty) — Empty-state reference | 5f7b1d44bd454d45a0b72fb76d94bbd0 | Desktop | /leadership | public | public/leadership.ejs | church/public/leadership.ejs | close | Yes | Yes | no published leaders | leader imageUrl | tenant-public-shell | Done B2 |
| 03-public-leadership-desktop-v2 (Populated) | 372faa60f8df4983b627db3cb5d35f9d | Desktop | /leadership | public | public/leadership.ejs | church/public/leadership.ejs | close ★canon | Yes | Yes | published leaders | leader imageUrl | tenant-public-shell | Done B2 |
| 03-public-leadership-mobile | 9342690a6b8644039395a0fb801d8be6 | Mobile | /leadership | public | public/leadership.ejs | church/public/leadership.ejs | obsolete | Yes | Yes | published leaders | leader imageUrl | tenant-public-shell | Done B2 |
| 03-public-leadership-mobile-v2 (Populated) | 025f0ef58e2f4443a60458aec0b1cc5e | Mobile | /leadership | public | public/leadership.ejs | church/public/leadership.ejs | obsolete | Yes | Yes | published leaders | leader imageUrl | tenant-public-shell | Done B2 |
| 03-public-leadership-mobile-v2 (Populated) | 2ca0d27a78f64b9f844a0251ca4e6bd4 | Mobile | /leadership | public | public/leadership.ejs | church/public/leadership.ejs | obsolete | Yes | Yes | published leaders | leader imageUrl | tenant-public-shell | Done B2 |
| 03-public-leadership-mobile-v4 (Restored) | 0f4e816fd64d4592bd3677fbde3b7544 | Mobile | /leadership | public | public/leadership.ejs | church/public/leadership.ejs | close ★canon | Yes | Yes | published leaders | leader imageUrl | tenant-public-shell | Done B2 |
| 04-public-ministries-desktop-v3 | 67fdba7676b549e493e39a83014fe4cf | Desktop | /ministries | public | public/ministries.ejs | church/public/ministries.ejs | obsolete | Yes | Yes | published ministries | — | tenant-public-shell | Done B2 |
| 04-public-ministries-desktop-v4 (Populated) | f146cdccadb34ff3bd8b0b75a0450d15 | Desktop | /ministries | public | public/ministries.ejs | church/public/ministries.ejs | close ★canon | Yes | Yes | published ministries | — | tenant-public-shell | Done B2 |
| 04-public-ministries-mobile-v3 | ba2fbcfd2db04fe495b873e418c233e0 | Mobile | /ministries | public | public/ministries.ejs | church/public/ministries.ejs | obsolete | Yes | Yes | published ministries | — | tenant-public-shell | Done B2 |
| 04-public-ministries-mobile-v4 (Populated) | d2fd7ecc586541d3beb5d0d3bed98d56 | Mobile | /ministries | public | public/ministries.ejs | church/public/ministries.ejs | close ★canon | Yes | Yes | published ministries | — | tenant-public-shell | Done B2 |
| 05-public-events-calendar-desktop — V5 implements list/featured, not calendar UI | 84b919385cfe4ca29a727cf108c887b0 | Desktop | /events (calendar) | public | public/events.ejs (list only) | church/public/events.ejs | obsolete | Yes | Yes | published events | — | tenant-public-shell | — |
| 05-public-events-calendar-desktop-v2 — V5 implements list/featured, not calendar UI | 25677650abeb4edea23c6a400013dd85 | Desktop | /events (calendar) | public | public/events.ejs (list only) | church/public/events.ejs | obsolete | Yes | Yes | published events | — | tenant-public-shell | — |
| 05-public-events-calendar-mobile — V5 implements list/featured, not calendar UI | 0a38bd5bf20a4926865e4d511e0ae2b3 | Mobile | /events (calendar) | public | public/events.ejs (list only) | church/public/events.ejs | obsolete | Yes | Yes | published events | — | tenant-public-shell | — |
| 05-public-events-calendar-mobile-v2 — V5 implements list/featured, not calendar UI | 26db8f19e5dd467995aa7ead9c8ee87e | Mobile | /events (calendar) | public | public/events.ejs (list only) | church/public/events.ejs | obsolete | Yes | Yes | published events | — | tenant-public-shell | — |
| 05-public-events-desktop-v2 (Empty) — Empty-state reference | 6c3a2b460ac54e6a88336af9085e8c38 | Desktop | /events | public | public/events.ejs | church/public/events.ejs | close | Yes | Yes | published events | — | tenant-public-shell | Done B3 |
| 05-public-events-desktop-v2 (Populated) | 6f618576f0304982bd239bfe04946e72 | Desktop | /events | public | public/events.ejs | church/public/events.ejs | close ★canon | Yes | Yes | published events | — | tenant-public-shell | Done B3 |
| 05-public-events-mobile-v2 (Populated) | f58c416cbbd545429258d963b3a15b60 | Mobile | /events | public | public/events.ejs | church/public/events.ejs | close ★canon | Yes | Yes | published events | — | tenant-public-shell | Done B3 |
| 06-public-sermons-desktop-v2 (Empty) — Empty-state reference | 0c7262cdda4547739ec0c1fa5128fb51 | Desktop | /sermons | public | public/sermons.ejs | church/public/sermons.ejs | close | Yes | Yes | published sermons | — | tenant-public-shell | Done B3 |
| 06-public-sermons-desktop-v2 (Populated) | 4f4995dc4ec84354ac80ed022a767ef3 | Desktop | /sermons | public | public/sermons.ejs | church/public/sermons.ejs | close ★canon | Yes | Yes | published sermons | — | tenant-public-shell | Done B3 |
| 06-public-sermons-mobile-v2 (Populated) | 96b380d4e47649c1bd7f05cabe9c3a1d | Mobile | /sermons | public | public/sermons.ejs | church/public/sermons.ejs | close ★canon | Yes | Yes | published sermons | — | tenant-public-shell | Done B3 |
| 06-public-sermons-resources-desktop — Prefer v2 populated | ebe20757fa8247adb7b8f1dec4b06c4e | Desktop | /sermons | public | public/sermons.ejs | church/public/sermons.ejs | obsolete | Yes | Yes | published sermons | — | tenant-public-shell | — |
| 06-public-sermons-resources-mobile — Prefer v2 populated | 5902746feee944089204f99023ca38c0 | Mobile | /sermons | public | public/sermons.ejs | church/public/sermons.ejs | obsolete | Yes | Yes | published sermons | — | tenant-public-shell | — |
| 07-public-giving-desktop-v2 (Empty) — Empty-state reference | a08093b9ec32467bad300ef43ac800fa | Desktop | /giving | public | public/giving.ejs | church/public/giving.ejs | close | Yes | Yes | published giving_methods | — | tenant-public-shell | Done B4 |
| 07-public-giving-desktop-v2 (Populated) | 59c8fdedf68a43e3a5d2384b0c2212df | Desktop | /giving | public | public/giving.ejs | church/public/giving.ejs | close ★canon | Yes | Yes | published giving_methods | — | tenant-public-shell | Done B4 |
| 07-public-giving-information-desktop — Prefer v2 populated | 141154401aff48b79f0ffd3d3bcd8bc6 | Desktop | /giving | public | public/giving.ejs | church/public/giving.ejs | obsolete | Yes | Yes | published giving_methods | — | tenant-public-shell | — |
| 07-public-giving-information-mobile — Prefer v2 populated | 5b65875aab7e4728af72f3d12ba06116 | Mobile | /giving | public | public/giving.ejs | church/public/giving.ejs | obsolete | Yes | Yes | published giving_methods | — | tenant-public-shell | — |
| 07-public-giving-mobile-v2 (Populated) | a0616f23568c464a95eda9e317e2fa9d | Mobile | /giving | public | public/giving.ejs | church/public/giving.ejs | close ★canon | Yes | Yes | published giving_methods | — | tenant-public-shell | Done B4 |
| 08-public-contact-desktop | 6d4d6ae29bc2405b9211131b1ccab287 | Desktop | /contact | public | public/contact.ejs | church/public/contact.ejs | obsolete | Yes | Yes | contact_channels + branch settings | — | tenant-public-shell | Done B4 |
| 08-public-contact-desktop-v2 (Populated) | ab93d842bf2e49caa838a1fd414eb35b | Desktop | /contact | public | public/contact.ejs | church/public/contact.ejs | close ★canon | Yes | Yes | contact_channels + branch settings | — | tenant-public-shell | Done B4 |
| 08-public-contact-mobile | 8f6f1528517b450c910ebac12ff89bd0 | Mobile | /contact | public | public/contact.ejs | church/public/contact.ejs | obsolete | Yes | Yes | contact_channels + branch settings | — | tenant-public-shell | Done B4 |
| 08-public-contact-mobile-v2 (Populated) | 9cbad6aacb6246549913e275f228fa80 | Mobile | /contact | public | public/contact.ejs | church/public/contact.ejs | close ★canon | Yes | Yes | contact_channels + branch settings | — | tenant-public-shell | Done B4 |

## 4. Tenant authentication and registration

_8 screens_

| Screen name | Stitch ID | Device | Intended route | Role | Current V5 view | Related V4 view | Status | Backend route | Backend service | Data dependency | Required asset | Shared shell | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10-auth-member-registration-desktop | c360aef636d341a8ad3eb47c4c2e5c21 | Desktop | /register | public | public/register.ejs | church/auth/register.ejs | close ★canon | Yes | Yes | member_registrations | — | tenant-auth | Done Reg |
| 10-auth-member-registration-mobile | 7d77190575b54d1b8277726570aec1c4 | Mobile | /register | public | public/register.ejs | church/auth/register.ejs | close ★canon | Yes | Yes | member_registrations | — | tenant-auth | Done Reg |
| 11-auth-registration-submitted-desktop | 1d37704351d6425ca872f8803322175c | Desktop | /register/submitted | public | public/register-submitted.ejs | church/auth/registration_submitted.ejs | close ★canon | Yes | Yes | none | — | tenant-auth | Done Reg |
| 11-auth-registration-submitted-mobile | f222e55152c349cc880548037aa7d540 | Mobile | /register/submitted | public | public/register-submitted.ejs | church/auth/registration_submitted.ejs | close ★canon | Yes | Yes | none | — | tenant-auth | Done Reg |
| 12-auth-waiting-verification-desktop | 239beae5140e44aeb34ba7034260cd5b | Desktop | — | member-pending | — | church/auth/waiting_verification.ejs | missing | No | No | pending registration session | — | — | B6 Auth deferred |
| 12-auth-waiting-verification-mobile | 8e6e504fcfa6452f9f3a719da33527fe | Mobile | — | member-pending | — | church/auth/waiting_verification.ejs | missing | No | No | pending registration session | — | — | B6 Auth deferred |
| 13-auth-forgot-password-desktop | 61a6861b34aa4c5390d4103b9d4da7b7 | Desktop | — | anon | — | church/auth/forgot_password.ejs | missing | No | No | — | — | — | B6 Auth deferred |
| 13-auth-forgot-password-mobile | f4bb9457291d44d0ac8be0ab5017d9a0 | Mobile | — | anon | — | church/auth/forgot_password.ejs | missing | No | No | — | — | — | B6 Auth deferred |

## 5. Member portal

_22 screens_

| Screen name | Stitch ID | Device | Intended route | Role | Current V5 view | Related V4 view | Status | Backend route | Backend service | Data dependency | Required asset | Shared shell | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 14-member-dashboard-desktop | 4207a5a6a8ac4464b2b899695bbc7c78 | Desktop | /member | member | member/dashboard.ejs | church/member/dashboard.ejs | close ★shell | Yes | Yes | — | — | member-shell | Done shell |
| 14-member-dashboard-mobile | b315a9d1288b4454bcc37f79c25c5e10 | Mobile | /member | member | member/dashboard.ejs | church/member/dashboard.ejs | close ★shell | Yes | Yes | — | — | member-shell | Done shell |
| 15-member-profile-desktop | a323f678460c4d62bfe1a8de462f58e1 | Desktop | /member/profile | member | member/profile.ejs | church/member/profile.ejs | close ★batch1 | Yes | Yes | — | — | member-shell | Done batch1 |
| 15-member-profile-mobile | 55e21b658b57471db74eccd77e386079 | Mobile | /member/profile | member | member/profile.ejs | church/member/profile.ejs | close ★batch1 | Yes | Yes | — | — | member-shell | Done batch1 |
| 16-member-announcements-desktop | 63a9e6139ffd41f19b6b6d2f090f0199 | Desktop | /member/announcements | member | announcements/member-list.ejs | church/member/announcements.ejs | close ★batch1 | Yes | Yes | announcements | — | member-shell | Done batch1 |
| 16-member-announcements-mobile | d7074e7cfd7048c98abb960826673c01 | Mobile | /member/announcements | member | announcements/member-list.ejs | church/member/announcements.ejs | close ★batch1 | Yes | Yes | announcements | — | member-shell | Done batch1 |
| 17-member-events-calendar-desktop — V5 list UI (not calendar) | 9a52685310ce4231bd9767ee3257c906 | Desktop | /member/events | member | participation/member-events.ejs | church/member/events.ejs | close ★batch2 | Yes | Yes | published events | — | member-shell | Done batch2 |
| 17-member-events-calendar-mobile — V5 list UI (not calendar) | a4dc4a494cc54143b76671bd89cdaa69 | Mobile | /member/events | member | participation/member-events.ejs | church/member/events.ejs | close ★batch2 | Yes | Yes | published events | — | member-shell | Done batch2 |
| 18-member-my-ministries-desktop | 05f9bdca09fd456595a15b963be8092a | Desktop | /member/ministries | member | participation/member-ministries.ejs | church/member/ministries.ejs | close ★batch2 | Yes | Yes | — | — | member-shell | Done batch2 |
| 18-member-my-ministries-mobile | 53924d7ece3e46e79d84556e56335b6e | Mobile | /member/ministries | member | participation/member-ministries.ejs | church/member/ministries.ejs | close ★batch2 | Yes | Yes | — | — | member-shell | Done batch2 |
| 19-member-resources-study-desktop | d1690ab7193d43e38ba9ba97c29d914c | Desktop | /member/resources | member | forms-requests/member-resources.ejs | church/member/resources.ejs | close ★batch3a | Yes | Yes | — | — | member-shell | Done batch3a |
| 19-member-resources-study-mobile | d3232a4f5e0f4d2da610740ca3a8f6b1 | Mobile | /member/resources | member | forms-requests/member-resources.ejs | church/member/resources.ejs | close ★batch3a | Yes | Yes | — | — | member-shell | Done batch3a |
| 20-member-forms-documents-desktop | 745a1972c0ba4ec893f64cc3457c0c95 | Desktop | /member/forms | member | forms-requests/member-forms.ejs | church/member/forms.ejs | close ★batch3a | Yes | Yes | — | — | member-shell | Done batch3a |
| 20-member-forms-documents-mobile | 0f801e19ed3d4332bee877001bdc1a13 | Mobile | /member/forms | member | forms-requests/member-forms.ejs | church/member/forms.ejs | close ★batch3a | Yes | Yes | — | — | member-shell | Done batch3a |
| 21-member-submit-online-request-desktop | 2cfd58a5ea094831a3a44eed73c44165 | Desktop | /member/requests/new | member | forms-requests/member-request-new.ejs | church/member/request_new.ejs | close ★batch3b | Yes | Yes | — | — | member-shell | Done B7 batch3b |
| 21-member-submit-online-request-mobile | 196260bada8445d5b107f4be552540dc | Mobile | /member/requests/new | member | forms-requests/member-request-new.ejs | church/member/request_new.ejs | close ★batch3b | Yes | Yes | — | — | member-shell | Done B7 batch3b |
| 22-member-request-status-desktop | 530cb58f684646b9b084f45eb2e17e90 | Desktop | /member/requests | member | forms-requests/member-requests.ejs | church/member/requests.ejs | close ★batch3b | Yes | Yes | — | — | member-shell | Done B7 batch3b |
| 22-member-request-status-mobile | 6c5f8b31ee394643a69dd7fe01c3e67e | Mobile | /member/requests | member | forms-requests/member-requests.ejs | church/member/requests.ejs | close ★batch3b | Yes | Yes | — | — | member-shell | Done B7 batch3b |
| 23-member-submit-prayer-request-desktop | 57edf48979d04b6d8647474961b48acb | Desktop | /member/prayer-request | member | — | church/member/prayer_request.ejs | missing | No | No | — | — | — | B7 Member deferred |
| 23-member-submit-prayer-request-mobile | 1dd180a3c5c5463988cb96dde2b44d37 | Mobile | /member/prayer-request | member | — | church/member/prayer_request.ejs | missing | No | No | — | — | — | B7 Member deferred |
| 24-member-giving-information-desktop — Prefer v2 populated | 3e72367008054943b23f6c690bac8eea | Desktop | /member/giving | member | member/giving.ejs | church/member/giving.ejs | close ★batch3b | Yes | Yes | published giving_methods | — | member-shell | Done B7 batch3b info-only |
| 24-member-giving-information-mobile — Prefer v2 populated | 236d4bf2f588459f8cde18bd164b09cd | Mobile | /member/giving | member | member/giving.ejs | church/member/giving.ejs | close ★batch3b | Yes | Yes | published giving_methods | — | member-shell | Done B7 batch3b info-only |

## 6. Branch administration

_44 screens_

| Screen name | Stitch ID | Device | Intended route | Role | Current V5 view | Related V4 view | Status | Backend route | Backend service | Data dependency | Required asset | Shared shell | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 04-branch-admin-dashboard-desktop — Prefer 25-branch-admin-dashboard | 969acd6c2f954d9ba10c02f842b54885 | Desktop | /branch-admin | branch_admin | branch-admin/dashboard.ejs | church/branch-admin/dashboard.ejs | obsolete | Yes | No | — | — | branch-admin-shell | — |
| 04-branch-admin-dashboard-mobile — Prefer 25-branch-admin-dashboard | c5791e6667c549488c64606ef8e92217 | Mobile | /branch-admin | branch_admin | branch-admin/dashboard.ejs | church/branch-admin/dashboard.ejs | obsolete | Yes | No | — | — | branch-admin-shell | — |
| 25-branch-admin-dashboard-desktop | 001d1a0235a14f47b456bb092a012f7c | Desktop | /branch-admin | branch_admin | branch-admin/dashboard.ejs | church/branch-admin/dashboard.ejs | close ★batch-shell | Yes | Yes | — | — | branch-admin-shell | Done B8 shell |
| 25-branch-admin-dashboard-mobile | 615f1f4eabd645c4a6840349edb17cd1 | Mobile | /branch-admin | branch_admin | branch-admin/dashboard.ejs | church/branch-admin/dashboard.ejs | close ★batch-shell | Yes | Yes | — | — | branch-admin-shell | Done B8 shell |
| 26-branch-member-verification-queue-desktop | 87fe9bb70b79434e88b91e0fd877d238 | Desktop | /branch-admin/registrations | branch_admin | branch-admin/registrations.ejs | church/branch-admin/registrations* | close ★batch1 | Yes | Yes | member_registrations | — | branch-admin-shell | Done B8 batch1 |
| 26-branch-member-verification-queue-mobile | d352ed076bbe4fabb1ad6f5ef66c0a25 | Mobile | /branch-admin/registrations | branch_admin | branch-admin/registrations.ejs | church/branch-admin/registrations* | close ★batch1 | Yes | Yes | member_registrations | — | branch-admin-shell | Done B8 batch1 |
| 27-branch-member-profile-desktop | 5e5985a087d049109c49006f99095884 | Desktop | /branch-admin/members/:id | branch_admin | branch-admin/member-detail.ejs | church/branch-admin/member* | close ★batch1 | Yes | Yes | members + memberships | — | branch-admin-shell | Done B8 batch1 |
| 27-branch-member-profile-mobile | b3fbd9e2eda64a2b998ec0e2a4311229 | Mobile | /branch-admin/members/:id | branch_admin | branch-admin/member-detail.ejs | church/branch-admin/member* | close ★batch1 | Yes | Yes | members + memberships | — | branch-admin-shell | Done B8 batch1 |
| 28-branch-member-directory-desktop | 3dae337c97e242049670749c2b1ab09d | Desktop | /branch-admin/members | branch_admin | branch-admin/members.ejs | church/branch-admin/members* | close ★batch1 | Yes | Yes | members + memberships | — | branch-admin-shell | Done B8 batch1 |
| 28-branch-member-directory-mobile | e90963b00bcf41368d089053a3a5db07 | Mobile | /branch-admin/members | branch_admin | branch-admin/members.ejs | church/branch-admin/members* | close ★batch1 | Yes | Yes | members + memberships | — | branch-admin-shell | Done B8 batch1 |
| 29-branch-ministries-directory-desktop | 58c96b4c5b554e6991fc080c63783b6c | Desktop | /branch-admin/content/ministries | branch_admin | content-admin/entities.ejs | church/branch-admin/ministries* | placeholder | Yes | Yes | — | — | branch-admin-shell | B8 Branch admin |
| 29-branch-ministries-directory-mobile | 526c14042cb045fd8c2cfcb568e2c8ae | Mobile | /branch-admin/content/ministries | branch_admin | content-admin/entities.ejs | church/branch-admin/ministries* | placeholder | Yes | Yes | — | — | branch-admin-shell | B8 Branch admin |
| 30-branch-ministry-profile-desktop | 064769bb18ab455fb2a39adf2f3c080a | Desktop | /branch-admin/content/ministries (entity) | branch_admin | content-admin/entity-fields.ejs | — | placeholder | Yes | Yes | — | — | branch-admin-shell | B8 Branch admin |
| 30-branch-ministry-profile-mobile | 17509b0d718346daaf4ac3b6c6f29d42 | Mobile | /branch-admin/content/ministries (entity) | branch_admin | content-admin/entity-fields.ejs | — | placeholder | Yes | Yes | — | — | branch-admin-shell | B8 Branch admin |
| 31-branch-departments-directory-desktop — No departments schema in V5 | 7ee4d401f26d45b8ae18f26fe9b391ec | Desktop | — | branch_admin | — | — | missing | No | No | — | — | — | B8 Branch deferred |
| 31-branch-departments-directory-mobile — No departments schema in V5 | 3794bd0c398b42cbb3987964807b27c3 | Mobile | — | branch_admin | — | — | missing | No | No | — | — | — | B8 Branch deferred |
| 32-branch-events-management-desktop | ad136a0e8f0f41aa8c88c59c77df5455 | Desktop | /branch-admin/content/events | branch_admin | content-admin/entities.ejs | — | placeholder | Yes | Yes | — | — | branch-admin-shell | B8 Branch admin |
| 32-branch-events-management-mobile | 112d23ce9441492cb5edc1c6ef1d5250 | Mobile | /branch-admin/content/events | branch_admin | content-admin/entities.ejs | — | placeholder | Yes | Yes | — | — | branch-admin-shell | B8 Branch admin |
| 33-branch-duty-roster-desktop | 37bdc9ea66db4ca2b4375d37605bdbb2 | Desktop | — | branch_admin | — | — | missing | No | No | — | — | — | B8 Branch deferred |
| 33-branch-duty-roster-mobile | 51d3e5bfce8641f0837a1556d659b6b7 | Mobile | — | branch_admin | — | — | missing | No | No | — | — | — | B8 Branch deferred |
| 34-branch-website-editor-desktop | 3f3160664d91423d80cb4ba81e2af6c4 | Desktop | /branch-admin/content | branch_admin | content-admin/index.ejs | — | placeholder | Yes | Yes | — | — | branch-admin-shell | B8 Branch admin |
| 34-branch-website-editor-mobile | f2bb5e794f074a1aa3d248a2fe54ddeb | Mobile | /branch-admin/content | branch_admin | content-admin/index.ejs | — | placeholder | Yes | Yes | — | — | branch-admin-shell | B8 Branch admin |
| 35-branch-announcements-management-desktop | 65941542c13048edb2c62bccd01ddcea | Desktop | /branch-admin/announcements | branch_admin | announcements/admin-list.ejs (+ detail/form/preview/publish) | church/branch-admin/announcements* | close ★batch1 | Yes | Yes | announcements | — | branch-admin-shell | Done B8 announcements GUI |
| 35-branch-announcements-management-mobile | daa416025c704a5693b295ef3139af89 | Mobile | /branch-admin/announcements | branch_admin | announcements/admin-list.ejs (+ detail/form/preview/publish) | church/branch-admin/announcements* | close ★batch1 | Yes | Yes | announcements | — | branch-admin-shell | Done B8 announcements GUI |
| 36-branch-attendance-tracker-desktop | d351ae0e154f44cd827314e415c0633e | Desktop | /branch-admin/attendance | branch_admin | attendance/admin-list.ejs | church/branch-admin/attendance* | close ★batch1 | Yes | Yes | attendance_events + entries | — | branch-admin-shell | Done B8 attendance GUI |
| 36-branch-attendance-tracker-mobile | 5ea15ec1eb9f4fceac664903c1778091 | Mobile | /branch-admin/attendance | branch_admin | attendance/admin-list.ejs | church/branch-admin/attendance* | close ★batch1 | Yes | Yes | attendance_events + entries | — | branch-admin-shell | Done B8 attendance GUI |
| 37-branch-attendance-record-detail-desktop | 12e5e7d87c894b059c437a4b38753514 | Desktop | /branch-admin/attendance/:id | branch_admin | attendance/admin-detail.ejs | church/branch-admin/attendance* | close ★batch1 | Yes | Yes | attendance_events + entries | — | branch-admin-shell | Done B8 attendance GUI |
| 37-branch-attendance-record-detail-mobile | 18a7d7a77b724653a42882743fb8a736 | Mobile | /branch-admin/attendance/:id | branch_admin | attendance/admin-detail.ejs | church/branch-admin/attendance* | close ★batch1 | Yes | Yes | attendance_events + entries | — | branch-admin-shell | Done B8 attendance GUI |
| 38-branch-giving-settings-desktop — Manual summaries; no gateway | 858c66cf5d654fffb90c5a264653f27a | Desktop | /branch-admin/giving | branch_admin | giving/admin-list.ejs | church/branch-admin/giving* | close ★batch1 | Yes | Yes | giving_categories + entries | — | branch-admin-shell | Done B8 giving GUI (no bank/QR) |
| 38-branch-giving-settings-mobile — Manual summaries; no gateway | 0769a7e1813d490d921a72a8bc8c3334 | Mobile | /branch-admin/giving | branch_admin | giving/admin-list.ejs | church/branch-admin/giving* | close ★batch1 | Yes | Yes | giving_categories + entries | — | branch-admin-shell | Done B8 giving GUI (no bank/QR) |
| 39-branch-giving-summary-desktop | cf849cdb676c48fd8f0f7d38b74c99b0 | Desktop | /branch-admin/giving/:id | branch_admin | giving/admin-detail.ejs | church/branch-admin/giving* | close ★batch1 | Yes | Yes | giving_entries | — | branch-admin-shell | Done B8 giving GUI |
| 39-branch-giving-summary-mobile | 20f32c9e77af423ca6a849a6759add28 | Mobile | /branch-admin/giving/:id | branch_admin | giving/admin-detail.ejs | church/branch-admin/giving* | close ★batch1 | Yes | Yes | giving_entries | — | branch-admin-shell | Done B8 giving GUI |
| 40-branch-reports-dashboard-desktop — V4 monthly reports not ported to V5 branch UI | d7bdddc0eb244b96a35d6aa6b9bb8f97 | Desktop | — | branch_admin | — | church/branch-admin reports* | missing | No | No | — | — | — | B8 Branch deferred |
| 40-branch-reports-dashboard-mobile — V4 monthly reports not ported to V5 branch UI | cc7a0658d477494e9a47c4852b7ed84b | Mobile | — | branch_admin | — | church/branch-admin reports* | missing | No | No | — | — | — | B8 Branch deferred |
| 41-branch-submit-monthly-report-desktop — V4 monthly reports not ported to V5 branch UI | 45a88626123b4fc8892ac50244dd561b | Desktop | — | branch_admin | — | church/branch-admin reports* | missing | No | No | — | — | — | B8 Branch deferred |
| 41-branch-submit-monthly-report-mobile — V4 monthly reports not ported to V5 branch UI | 1be0cd7ef8f8433bbd44c6d1573e495c | Mobile | — | branch_admin | — | church/branch-admin reports* | missing | No | No | — | — | — | B8 Branch deferred |
| 42-branch-report-history-desktop — V4 monthly reports not ported to V5 branch UI | 5b6ec354f47c4ceda67739b07136a6c0 | Desktop | — | branch_admin | — | church/branch-admin reports* | missing | No | No | — | — | — | B8 Branch deferred |
| 42-branch-report-history-mobile — V4 monthly reports not ported to V5 branch UI | 28a3a26278fb4b639b7ffe7bbf408bb1 | Mobile | — | branch_admin | — | church/branch-admin reports* | missing | No | No | — | — | — | B8 Branch deferred |
| 43-branch-report-details-desktop — V4 monthly reports not ported to V5 branch UI | 48955e5ac03442acb363d8d0dd68975e | Desktop | — | branch_admin | — | church/branch-admin reports* | missing | No | No | — | — | — | B8 Branch deferred |
| 43-branch-report-details-mobile — V4 monthly reports not ported to V5 branch UI | 4767ec0f410a4287ba79bdcf049a7cc0 | Mobile | — | branch_admin | — | church/branch-admin reports* | missing | No | No | — | — | — | B8 Branch deferred |
| 44-branch-request-workflow-queue-desktop | 126bfebff1414fc08367039b84587819 | Desktop | /branch-admin/requests | branch_admin | forms-requests/admin-requests.ejs | — | close ★batch1 | Yes | Yes | member_requests | — | branch-admin-shell | Done B8 forms-requests GUI (no fabricated metrics) |
| 44-branch-request-workflow-queue-mobile | 9b6531097eec43fb8ce22115dd170429 | Mobile | /branch-admin/requests | branch_admin | forms-requests/admin-requests.ejs | — | close ★batch1 | Yes | Yes | member_requests | — | branch-admin-shell | Done B8 forms-requests GUI (no fabricated metrics) |
| 45-branch-request-details-desktop | 22fe4b70e55e4be498d7008741147d55 | Desktop | /branch-admin/requests/:id | branch_admin | forms-requests/admin-request-detail.ejs | — | close ★batch1 | Yes | Yes | member_requests + private attachment | — | branch-admin-shell | Done B8 forms-requests GUI |
| 45-branch-request-details-mobile | 9d8f71d056e54d7da7586d88e253af93 | Mobile | /branch-admin/requests/:id | branch_admin | forms-requests/admin-request-detail.ejs | — | close ★batch1 | Yes | Yes | member_requests + private attachment | — | branch-admin-shell | Done B8 forms-requests GUI |

## 7. HQ administration

_22 screens_

| Screen name | Stitch ID | Device | Intended route | Role | Current V5 view | Related V4 view | Status | Backend route | Backend service | Data dependency | Required asset | Shared shell | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 51-hq-dashboard-desktop | 538c8f4f1a844930ac058428bf390a76 | Desktop | /hq | church_hq_admin | hq/dashboard.ejs | church/hq/* | close ★batch1 | Yes | Yes | active branch count | — | hq-shell | Done B9 HQ shell (no fake metrics) |
| 51-hq-dashboard-mobile | c67eda7682de428d985416074f606fcf | Mobile | /hq | church_hq_admin | hq/dashboard.ejs | church/hq/* | close ★batch1 | Yes | Yes | active branch count | — | hq-shell | Done B9 HQ shell (no fake metrics) |
| 52-hq-branch-registry-desktop | 1a1aaecd09d34357886aa0b1028e539a | Desktop | /hq/branches | church_hq_admin | hq/branches.ejs | — | close ★batch1 | Yes | Yes | active branches | — | hq-shell | Done B9 HQ shell |
| 52-hq-branch-registry-mobile | 2f154dfcd0e045938a60ae3c147b240a | Mobile | /hq/branches | church_hq_admin | hq/branches.ejs | — | close ★batch1 | Yes | Yes | active branches | — | hq-shell | Done B9 HQ shell |
| 53-hq-branch-performance-desktop — Aggregates only vs Stitch performance UI | f6b636977d7d40b89bd4048b696a4095 | Desktop | /hq/reports | church_hq_admin | hq/reports.ejs | — | placeholder | Yes | Partial | — | — | hq-shell | B9 HQ admin |
| 53-hq-branch-performance-mobile — Aggregates only vs Stitch performance UI | 922867aec8474f11baff555043b86eea | Mobile | /hq/reports | church_hq_admin | hq/reports.ejs | — | placeholder | Yes | Partial | — | — | hq-shell | B9 HQ admin |
| 54-hq-monthly-reports-review-desktop — V4 monthly review workflow not in V5 | 4404007361f54173a1a9e37ab6285aa5 | Desktop | — | church_hq_admin | — | — | missing | No | No | — | — | — | B9 HQ deferred |
| 54-hq-monthly-reports-review-mobile — V4 monthly review workflow not in V5 | b53425f344804e4681eefb59f3d6cfdd | Mobile | — | church_hq_admin | — | — | missing | No | No | — | — | — | B9 HQ deferred |
| 55-hq-report-review-detail-desktop — V4 monthly review workflow not in V5 | aa7cdf0f1bf349aeaf531dbcccba2eea | Desktop | — | church_hq_admin | — | — | missing | No | No | — | — | — | B9 HQ deferred |
| 55-hq-report-review-detail-mobile — V4 monthly review workflow not in V5 | d03fc656f0ce4c969c7e6fbc6c0a8041 | Mobile | — | church_hq_admin | — | — | missing | No | No | — | — | — | B9 HQ deferred |
| 56-hq-audit-review-queue-desktop | 80d249f8fda84958a8a42e458075b19e | Desktop | /hq/audit | church_hq_admin | hq/audit.ejs | — | placeholder | Yes | Yes | — | — | hq-shell | B9 HQ admin |
| 56-hq-audit-review-queue-mobile | 097ab7191cb645f7b3f135d278ba580f | Mobile | /hq/audit | church_hq_admin | hq/audit.ejs | — | placeholder | Yes | Yes | — | — | hq-shell | B9 HQ admin |
| 57-hq-consolidated-analytics-desktop | 2a577dc15d4342acb152f16aed21c267 | Desktop | /hq/reports | church_hq_admin | hq/reports.ejs | — | placeholder | Yes | Yes | — | — | hq-shell | B9 HQ admin |
| 57-hq-consolidated-analytics-mobile | 06489c79d0d04a429e57eba5c717ba47 | Mobile | /hq/reports | church_hq_admin | hq/reports.ejs | — | placeholder | Yes | Yes | — | — | hq-shell | B9 HQ admin |
| 58-hq-global-audit-trail-desktop | bce1e8ec4078407c8d6179251b8765c2 | Desktop | /hq/audit | church_hq_admin | hq/audit.ejs | — | placeholder | Yes | Yes | — | — | hq-shell | B9 HQ admin |
| 58-hq-global-audit-trail-mobile | d7fcb1b3a796434a8fefc7e806c2c0b6 | Mobile | /hq/audit | church_hq_admin | hq/audit.ejs | — | placeholder | Yes | Yes | — | — | hq-shell | B9 HQ admin |
| 59-hq-permission-role-management-desktop | 12f5be535eeb49f1a1c5822ae7586504 | Desktop | — | church_hq_admin | — | — | missing | No | No | — | — | — | B9 HQ deferred |
| 59-hq-permission-role-management-mobile | de3e82ef3ad54065a516b042459fdc19 | Mobile | — | church_hq_admin | — | — | missing | No | No | — | — | — | B9 HQ deferred |
| 60-hq-organization-templates-standards-desktop | df111bee19304663b356561a114c78bc | Desktop | — | church_hq_admin | — | — | missing | No | No | — | — | — | B9 HQ deferred |
| 60-hq-organization-templates-standards-mobile | 801584edfae5462c829f232ff5c99a4b | Mobile | — | church_hq_admin | — | — | missing | No | No | — | — | — | B9 HQ deferred |
| 61-hq-broadcast-center-desktop | ffa76443af8c4aa4ab97086fc8922b73 | Desktop | — | church_hq_admin | — | — | missing | No | No | — | — | — | B9 HQ deferred |
| 61-hq-broadcast-center-mobile | b4184b738eca442d8ca9ff3dbd445bec | Mobile | — | church_hq_admin | — | — | missing | No | No | — | — | — | B9 HQ deferred |

## 8. Platform administration

_14 screens_

| Screen name | Stitch ID | Device | Intended route | Role | Current V5 view | Related V4 view | Status | Backend route | Backend service | Data dependency | Required asset | Shared shell | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 62-platform-admin-dashboard-desktop | 36c4708b025b4e7eaeab9ed508603b03 | Desktop | /admin | platform_admin | platform-admin/dashboard.ejs | admin/* | placeholder | Yes | Yes | — | — | platform-admin-shell | B10 Platform admin |
| 62-platform-admin-dashboard-mobile | 513dd5cc58c74b21bd7ee8d106dfac55 | Mobile | /admin | platform_admin | platform-admin/dashboard.ejs | admin/* | placeholder | Yes | Yes | — | — | platform-admin-shell | B10 Platform admin |
| 63-platform-church-organizations-desktop | 18da9665bc674d2dbd249cbbb269d58d | Desktop | /admin/organizations | platform_admin | platform-admin/organizations.ejs | — | placeholder | Yes | Yes | — | — | platform-admin-shell | B10 Platform admin |
| 63-platform-church-organizations-mobile | db6b741d99e34d10b01496a83de5072a | Mobile | /admin/organizations | platform_admin | platform-admin/organizations.ejs | — | placeholder | Yes | Yes | — | — | platform-admin-shell | B10 Platform admin |
| 64-platform-create-church-organization-desktop — CLI provision only today | d992150d24cb4cd3afdca87ca3ce915f | Desktop | /admin/organizations/new | platform_admin | — | — | missing | No | Yes (provisioning service) | — | — | — | B10 Platform admin |
| 64-platform-create-church-organization-mobile — CLI provision only today | 0da4f454abf0402dbe09f82959f29afa | Mobile | /admin/organizations/new | platform_admin | — | — | missing | No | Yes (provisioning service) | — | — | — | B10 Platform admin |
| 65-platform-branch-tenants-desktop | 10f1dceb6d694563aaf152ecaedac3d3 | Desktop | /admin/organizations/:key | platform_admin | platform-admin/organization-detail.ejs | — | placeholder | Yes | Partial | — | — | platform-admin-shell | B10 Platform admin |
| 65-platform-branch-tenants-mobile | 6633fa49f7b9420a8c1705f1e43c9efb | Mobile | /admin/organizations/:key | platform_admin | platform-admin/organization-detail.ejs | — | placeholder | Yes | Partial | — | — | platform-admin-shell | B10 Platform admin |
| 66-platform-plans-limits-desktop — Catalogue + org assign/override; no billing UI | 4d0f59ac6acf4fcc9e1e0ed746abb5fd | Desktop | /admin/plans | platform_admin | platform-admin/plans.ejs | — | close | Yes | Yes | platform.plans + entitlements | — | platform-admin-shell | B10 Platform admin |
| 66-platform-plans-limits-mobile — Catalogue + org assign/override; no billing UI | b5953809962f4e0a8eae4ea96aa4575a | Mobile | /admin/plans | platform_admin | platform-admin/plans.ejs | — | close | Yes | Yes | platform.plans + entitlements | — | platform-admin-shell | B10 Platform admin |
| 67-platform-settings-desktop — Read-only DNS patterns; no save/failover | 30e3856782bd41b6bf14402e1e535cbd | Desktop | /admin/settings | platform_admin | platform-admin/settings.ejs | — | close | Yes | Partial | deployments + reserved slugs | — | platform-admin-shell | B10 Platform admin |
| 67-platform-settings-mobile — Read-only DNS patterns; no save/failover | efb0fd24f1184968be79083974dcd092 | Mobile | /admin/settings | platform_admin | platform-admin/settings.ejs | — | close | Yes | Partial | deployments + reserved slugs | — | platform-admin-shell | B10 Platform admin |
| 68-platform-support-monitoring-desktop — Deployment registry only; no tickets/fake health | 74cbe4a015754137ad414222f3941ef2 | Desktop | /admin/deployments | platform_admin | platform-admin/deployments.ejs | — | partial | Yes | Partial | platform.deployments | — | platform-admin-shell | B10 Platform admin |
| 68-platform-support-monitoring-mobile — Deployment registry only; no tickets/fake health | 9f40042097d7471db1f5628fbb0d27d8 | Mobile | /admin/deployments | platform_admin | platform-admin/deployments.ejs | — | partial | Yes | Partial | platform.deployments | — | platform-admin-shell | B10 Platform admin |

## Appendix — Leader portal (no V5 role)

_10 screens_

| Screen name | Stitch ID | Device | Intended route | Role | Current V5 view | Related V4 view | Status | Backend route | Backend service | Data dependency | Required asset | Shared shell | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 46-leader-dashboard-desktop — No V5 leader role/routes | 558f95cbc5604764a1b1a58e358f4b27 | Desktop | — | leader | — | church/leader/* (if any) | missing | No | No | — | — | — | Out of V5 scope |
| 46-leader-dashboard-mobile — No V5 leader role/routes | 953dfecffd5e4e79bd58e581d49c13c8 | Mobile | — | leader | — | church/leader/* (if any) | missing | No | No | — | — | — | Out of V5 scope |
| 47-leader-ministry-roster-desktop — No V5 leader role/routes | 4b2c2162daa847338b088026a12a536a | Desktop | — | leader | — | church/leader/* (if any) | missing | No | No | — | — | — | Out of V5 scope |
| 47-leader-ministry-roster-mobile — No V5 leader role/routes | 7c64aefd130f43f3910888d0116afae2 | Mobile | — | leader | — | church/leader/* (if any) | missing | No | No | — | — | — | Out of V5 scope |
| 48-leader-record-attendance-desktop — No V5 leader role/routes | 5a1fd765d2634bc990a6be831722c803 | Desktop | — | leader | — | church/leader/* (if any) | missing | No | No | — | — | — | Out of V5 scope |
| 48-leader-record-attendance-mobile — No V5 leader role/routes | 8ea2993615e74de4b8136ef770b784d7 | Mobile | — | leader | — | church/leader/* (if any) | missing | No | No | — | — | — | Out of V5 scope |
| 49-leader-submit-ministry-report-desktop — No V5 leader role/routes | 202f402c811b4975a0da4c39c1e55d22 | Desktop | — | leader | — | church/leader/* (if any) | missing | No | No | — | — | — | Out of V5 scope |
| 49-leader-submit-ministry-report-mobile — No V5 leader role/routes | b4ecb0d74f58402ea20f84383b84e821 | Mobile | — | leader | — | church/leader/* (if any) | missing | No | No | — | — | — | Out of V5 scope |
| 50-leader-ministry-requests-desktop — No V5 leader role/routes | e18298edd9c742aa82c2c776daaf4272 | Desktop | — | leader | — | church/leader/* (if any) | missing | No | No | — | — | — | Out of V5 scope |
| 50-leader-ministry-requests-mobile — No V5 leader role/routes | 29895b648447493da4f57dce7813b2e1 | Mobile | — | leader | — | church/leader/* (if any) | missing | No | No | — | — | — | Out of V5 scope |

## 9. Shared states and components

_9 screens_

| Screen name | Stitch ID | Device | Intended route | Role | Current V5 view | Related V4 view | Status | Backend route | Backend service | Data dependency | Required asset | Shared shell | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A minimalist church icon in #6C5CE7, identical in style and geometry to the icon in {{DATA:IMAGE:IMAGE_109}}. Clean, bold lines, centered composition, suitable for a 32x32 favicon. Transparent background. No text. — Design system / asset boards — not product routes | e2d6dccfc9814eafb6bd9661ee348194 | Unspecified | — | design | partials/powered-by-getpro + CSS tokens | — | obsolete | No | No | — | — | — | Reference only |
| BlessBoard - Desktop Header Reference — Design system / asset boards — not product routes | 43d6d1cb110240c8aa7e5989386ea63b | Desktop | — | design | partials/powered-by-getpro + CSS tokens | — | obsolete | No | No | — | — | — | Reference only |
| BlessBoard - Mobile Header Reference — Design system / asset boards — not product routes | 2d430d9648cc404b88f7463e170aa3b5 | Mobile | — | design | partials/powered-by-getpro + CSS tokens | — | obsolete | No | No | — | — | — | Reference only |
| BlessBoard Church Logo — Design system / asset boards — not product routes | 59da7230441e46d387320a2b6ef32f5c | Unspecified | — | design | partials/powered-by-getpro + CSS tokens | — | obsolete | No | No | — | — | — | Reference only |
| BlessBoard Logo & Header Spec — Design system / asset boards — not product routes | 7880f0e354c445729cc01125f1526603 | Desktop | — | design | partials/powered-by-getpro + CSS tokens | — | obsolete | No | No | — | — | — | Reference only |
| BlessBoard Powered by GetPro Logo — Design system / asset boards — not product routes | 503ff0d768f04d1db68b72ce309b040c | Unspecified | — | design | partials/powered-by-getpro + CSS tokens | — | obsolete | No | No | — | — | — | Reference only |
| BlessBoard Public Visual System Board — Design system / asset boards — not product routes | 8f689e44024444839a9c3174f03d4101 | Desktop | — | design | partials/powered-by-getpro + CSS tokens | — | obsolete | No | No | — | — | — | Reference only |
| BlessBoard Shared UI States Board — Design system / asset boards — not product routes | b61a1ea8176648408211b681e942e0a6 | Desktop | — | design | partials/powered-by-getpro + CSS tokens | — | obsolete | No | No | — | — | — | Reference only |
| BlessBoard Visual System Specification — Design system / asset boards — not product routes | c8d8352b1b95400cb25e32a79c2f0b2e | Desktop | — | design | partials/powered-by-getpro + CSS tokens | — | obsolete | No | No | — | — | — | Reference only |

## Apex home implementation (2026-07-18)

| Surface | Status | Notes |
|---------|--------|-------|
| `GET /` apex | **close** | Stitch hero, audience, features, footer; nav remains Home/Login or Home/Account/Logout |
| Desktop IDs | `46081ff8f3d04090b9de33020bdf1530` | Local homepage imagery |
| Mobile IDs | `9f9927a608024e4ebaae11f13e68bdc5` | Drawer via `apex.js` |
| Not in this pass | Features/Pricing/Directory routes | Still **missing** |

## Apex authentication implementation (2026-07-18)

| Surface | Status | Notes |
|---------|--------|-------|
| `GET/POST /login` | **close** | Stitch dual-pane `apex/login.ejs`; error states via `data-bb-auth-error` |
| Desktop / mobile IDs | `9b264ef3081f4b5aab493d9b9710b00b` / `68a84bcc8dff4f4ca5836216c22a2e6a` | No forgot-password / register links (not in V5 apex scope) |
| `GET /account` | **close** | Apex shell card; POST logout; no UUIDs/session details |
| Auth error page | **close** | Expired / throttled / generic presentation only |
| Not changed | Auth services, CSRF, cookies, rate limits, redirects | Presentation-only |

## Tenant public batch 1 (shell + home + about)

| Surface | Status | Notes |
|---------|--------|-------|
| Shared shell | **close** | Header, desktop nav, mobile drawer, footer, env badge, Powered by GetPro |
| Home desktop / mobile | `ead45db5be774baa9454412262096ffc` / `89177588fbf8405dbebd5747c38e19ce` | CMS sections only — no Stitch demo metrics/announcements/prayer forms |
| About desktop / mobile | `44492f6abbe849d0a8a89303ce83129b` / `3f0b8a5c30544d9495064df8d5f9e62e` | Published sections; intentional empty; no fabricated stats |
| Data | Branch → church → empty | `resolvePublishedPage` / published-content services |

## Tenant public batch 2a (leadership + ministries)

| Surface | Status | Notes |
|---------|--------|-------|
| Leadership desktop / mobile | `372faa60f8df4983b627db3cb5d35f9d` / `0f4e816fd64d4592bd3677fbde3b7544` | Featured + grid/list; initials fallback; no Contact Pastor / View Profile |
| Leadership empty | `5f7b1d44bd454d45a0b72fb76d94bbd0` | Intentional empty + Contact/About CTAs |
| Ministries desktop / mobile | `f146cdccadb34ff3bd8b0b75a0450d15` / `d2fd7ecc586541d3beb5d0d3bed98d56` | Published cards; meetingDay only when set; no downloads/schedule/contact-leader fabrications |
| Ordering | `sort_order ASC` | Branch-first published lists |

## Cross-cutting findings

### Duplicate Stitch screens

- Multiple `01-public-home-*` base copies (3 desktop + 3 mobile) — use refined v2 only.
- Leadership mobile has duplicate “v2 (Populated)” IDs plus v4 Restored — use v4 Restored mobile + v2 Populated desktop.
- Ministries/Events/Sermons/Giving/Contact have v2/v3/v4 + empty variants — prefer populated; keep empty for empty-state QA.
- Branch dashboard appears as both `04-branch-admin-dashboard-*` and `25-branch-admin-dashboard-*` — prefer **25**.
- Platform `01-platform-home/church-finder` overlaps BlessBoard marketing Directory/Home — marketing BlessBoard set is canonical for apex.

### Inconsistent navigation

- Stitch tenant public nav often shorter (Home/Ministries/Events/Give/Resources) vs V5 full CMS nav (includes About, Leadership, Contact, Sermons).
- Stitch member mobile uses bottom tabs; V5 `member-shell` now ships desktop sidebar + mobile header/drawer + bottom tabs (shell done; module interiors remain B7).
- Apex Stitch marketing nav (Features/Pricing/For Churches) has **no** V5 routes yet; live apex shows foundation Home/Login only.
- Tenant `/login` Stitch is a password form; V5 correctly **redirects** to apex transfer — do not invent tenant password UI.

### Screens without mobile / desktop pair

- Desktop-only families (6): 02-public-about-sample, blessboard - desktop header reference, blessboard logo & header spec, blessboard public visual system board, blessboard shared ui states board, blessboard visual system specification
- Mobile-only families (1): blessboard - mobile header reference
- Unspecified device (assets/boards): 3 — logos/favicon boards.

### Obsolete V4 screens (do not port DB/session patterns)

- V4 tenant password `/login`, `public.tenants` resolution, `Domain=.blessboard.org` cookies, `connect-pg-simple` sessions.
- V4 `/branch/*` path prefix vs V5 `/branch-admin/*`.
- V4 apex marketing on tenant hosts; V4 Inter token stack for tenant public.
- V4 waiting-verification / forgot-password exist as references only until V5 product decides.

### Missing backend routes (Stitch exists, V5 route absent)

- /features
- /for-churches
- /register-church
- /directory
- /pricing
- /member/prayer-request
- /member/giving
- /branch-admin/members
- duty roster
- departments
- branch monthly reports
- HQ monthly report review
- HQ permissions/templates/broadcast
- /admin/organizations/new
- plans/settings/support invent-billing UI (prices, tickets, failover)
- waiting-verification
- forgot-password
- leader portal /*

### Screens blocked by missing data / product gaps

- Tenant public imagery: only when CMS `mediaUrl` / entity images published (no fabricated demos).
- Map on `/contact`: requires valid branch lat/lng.
- Giving: published methods only; **no** payment processing.
- Member prayer: no V5 route (dashboard disabled). Member giving: `/member/giving` info-only.
- Leader portal: no V5 role.
- Branch departments / duty roster / monthly report submit: no V5 schema/UI.
- Platform create-org UI: provisioning is CLI today.

### Shared components to build once

| Component | Used by | Current V5 |
|-----------|---------|------------|
| Tenant public shell (header/nav/drawer/footer + Powered by GetPro) | Public CMS pages | `tenant-public-shell-*` **done** |
| Tenant auth chrome (split panel) | Register / submitted | `tenant-auth.css` **done** |
| Apex auth chrome | Apex `/login`, auth errors | `renderLoginPage` / `renderAuthErrorPage` **done** |
| Member shell (desktop sidebar + mobile nav) | `/member/*` | `member-shell-*` **done** (dashboard cards; module interiors still B7) |
| Branch admin shell | `/branch-admin/*` | `branch-admin-shell-*` |
| HQ shell + branch selector | `/hq/*` | `hq-shell-*`, `branch-selector` |
| Platform admin shell | `/admin/*` | `platform-admin-shell-*` |
| Content-admin entity/page editors | HQ + branch content | `content-admin/*` shared |
| Announcements / attendance / giving / forms-requests admin views | HQ + branch mounts | shared EJS by `shellKind` |
| Empty state pattern | Public + portals | `.bb-tp-empty` / portal empties — unify tokens |
| Sacred Modernity tokens (Hanken, `#6C5CE7`, GetPro orange) | All | Partially applied; continue reuse |

## Recommended implementation batch order

| Batch | Scope | Notes |
|-------|--------|-------|
| **Done B1–B4** | Tenant public shell + CMS pages + register/apex login | Visual **close**; run B11 regression |
| **B5** | Apex marketing (`/`, Features, Pricing, For Churches, Register Church, Directory) | Routes mostly **missing** |
| **B6** | Auth deferred (waiting verification, forgot password) only if product requires | Currently **missing** |
| **B7** | Member portal Stitch chrome (14–22); defer 23–24 unless scoped | Backend **available** |
| **B8** | Branch admin Stitch chrome (25–26, 29–30, 32, 34–39, 44–45); defer members/departments/roster/reports | |
| **B9** | HQ Stitch chrome (51–52, 56–58); defer 53–55/59–61 if no backend | |
| **B10** | Platform admin (62–68); defer create-org + invent-billing/support-queue UI | |
| **B11** | Playwright visual regression vs canonical Stitch pairs | |
| **Out of scope** | Leader portal 46–50 | No V5 role |

## Exact next prompt

```
Implement BlessBoard V5 GUI batch B5 (apex marketing) using the connected Stitch project.

Scope only apex marketing routes against canonical Stitch screens in docs/ui/V5_STITCH_SCREEN_MAP.md:
- / (apex home) — 46081ff8f3d04090b9de33020bdf1530 / 9f9927a608024e4ebaae11f13e68bdc5
- /features — 7ef3518f23a0400098d810f617dd0cc0 / 5ac1e1b0600b4bc78f945e36b56aaece
- /pricing (+ FAQ) — 1c50e898… / 181ec1f8… and c47840e7… / 65067eb3…
- /for-churches — fc4bf5aa… / 55af3450…
- /register-church — 8640e853… / 515da582…
- /directory — 2b9df962… / ab5d47e2…

Do not change tenant public, auth transfer, or portal modules.
Do not copy V4 sessions/tenants middleware.
No migrations unless explicitly required for read-only directory data already in platform DB.
Follow GUI EXECUTION RULES. Run focused apex tests only + git diff --check.
```

*Generated from MCP list_screens (196) + V5 view/route inventory. Prefer this file over V4 `docs/blessboard-stitch-screen-inventory.md` for V5 work.*
