# Foundation & Growth — implementation queue

**Date:** 2026-07-19 (refresh)
**Companion:** [`FOUNDATION_GROWTH_SCREEN_COVERAGE.md`](../product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md) · [`FOUNDATION_GROWTH_BLOCKED_SCREENS.md`](./FOUNDATION_GROWTH_BLOCKED_SCREENS.md) · [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md)
**Constraint:** Presentation / EJS / CSS only unless a batch notes a tiny product decision. **No** schema, auth, session, hostname, or billing changes.
**Rule:** One screen, or two tightly related screens, per batch.

**Included statuses only:** `PARTIAL` · `PLACEHOLDER` · `MISSING_GUI`
**Excluded:** `MISSING_BACKEND` · `MISSING_STITCH` · `DEFERRED` · `NOT_IN_SCOPE` · `COMPLETE`

**Already executed (do not re-queue):** FG-01 Features · FG-08a HQ reports hub + attendance

---

## Queue order (fixed)

1. Foundation authentication and public screens
2. Foundation member screens
3. Foundation branch-admin screens
4. Foundation basic HQ screens
5. Growth multi-branch HQ screens
6. Growth advanced reports
7. Shared media and UI states
8. Final parity audits

---

## 1 — Foundation authentication and public screens

| Batch | Package | Screen | Stitch IDs | Route | Template | Backend ready | Tests | Likely files |
|-------|---------|--------|------------|-------|----------|---------------|-------|--------------|
| **FG-Q01** | Platform | Apex Home | D `46081ff8f3d04090b9de33020bdf1530` · M `9f9927a608024e4ebaae11f13e68bdc5` | `/` (apex) | apex home / `renderFoundationHome` | Yes | `apex-home`, `apex-marketing` | `views/blessboard/v5/apex/home.ejs`, `apex.css`, `apex-shell-*`, `renderTenantLandingPage.js` (locals only) |
| **FG-Q02** | Platform | Pricing + FAQ | D `1c50e898…` / `c47840e7…` · M `181ec1f8…` / `65067eb3…` | `/pricing` | `apex/pricing.ejs` | Yes — `platformPricingContent` | `apex-marketing` | pricing EJS, `apex.css`, pricing content module |
| **FG-Q03** | Platform | Church Directory | D `2b9df962f4ff4b4e8a45be51f99a5497` · M `ab5d47e2d6c54065a4eb66c906d3c39c` | `/directory` | `apex/directory.ejs` | Yes — hostname catalogue | `apex-marketing` | directory render path, `apex.css` |
| **FG-Q04** | Platform | Register Your Church | D `8640e8531e7144c3a048617592979cb7` · M `515da582d2504feaaa00c03b7a2e77e1` | `/register-church` | `apex/register-church.ejs` | Enquiry UI only | `apex-marketing` | register-church EJS, `apex.css` |
| **FG-Q05** | Platform | For Churches | D `fc4bf5aab5bb4737a56d72030bae8803` · M `55af3450069944598d9f0ce17df12da6` | `/for-churches` | `apex/for-churches.ejs` | Yes | `apex-marketing` | for-churches EJS, `apex.css` |
| **FG-Q06** | Platform | Create organization UI | D `d992150d24cb4cd3afdca87ca3ce915f` · M `0da4f454abf0402dbe09f82959f29afa` | `/admin/organizations/new` | — (MISSING_GUI) | CLI provision exists | provisioning / `platform-admin-shell` | `platformAdminRoutes.js` (new GET only if product unlocks), `platform-admin/*`, `platform-admin.css` |

**Stop conditions (1):** No checkout; no self-serve org provision POST unless product unlocks FG-Q06; no Network sold as Growth; no tenant password / forgot-password invention.

---

## 2 — Foundation member screens

| Batch | Package | Screen | Stitch IDs | Route | Template | Backend ready | Tests | Likely files |
|-------|---------|--------|------------|-------|----------|---------------|-------|--------------|
| **FG-Q07** | Foundation | Member dashboard (prayer CTA) | Dashboard D `4207a5a6…` · M `b315a9d1…`; prayer ref `57edf489…` / `1dd180a3…` | `/member` → keep `/member/requests/new?category=prayer` **or** hide CTA | `member/dashboard.ejs` | Ready if linking to requests; **blocked** if dedicated `/member/prayer-request` required | `member-portal`, `forms-requests` | `dashboard.ejs`, `memberPortalNav.js` / routes disabled tile, `member-portal.css` |

**Stop conditions (2):** Owner decision required before coding. Do not invent prayer table or dead href.

---

## 3 — Foundation branch-admin screens

| Batch | Package | Screen | Stitch IDs | Route | Template | Backend ready | Tests | Likely files |
|-------|---------|--------|------------|-------|----------|---------------|-------|--------------|
| **FG-Q08** | Foundation | Ministry profile | D `064769bb18ab455fb2a39adf2f3c080a` · M `17509b0d718346daaf4ac3b6c6f29d42` | `/branch-admin/content/ministries` entity fields | `content-admin/entity-fields.ejs` | Yes — entity CRUD | `content-admin` | `entity-fields.ejs`, entities list chrome, branch-admin / content CSS |
| **FG-Q09** | Foundation | Announcement preview | D `65941542c13048edb2c62bccd01ddcea` · M `daa416025c704a5693b295ef3139af89` | `/branch-admin/announcements` (+ preview) | `announcements/admin-preview.ejs` (+ publish if tight) | Yes — no schedule | `announcements` | `admin-preview.ejs`, announcements CSS |
| **FG-Q10** | Foundation | Website editor | D `3f3160664d91423d80cb4ba81e2af6c4` · M `f2bb5e794f074a1aa3d248a2fe54ddeb` | `/branch-admin/content` (+ page/section) | `content-admin/index.ejs`, `page.ejs`, `section.ejs` | Yes | `content-admin` | content-admin EJS, branch-admin CSS |

**Stop conditions (3):** No departments/duty roster/KPI invention; no SMS/scheduling; existing CMS fields only.

---

## 4 — Foundation basic HQ screens

| Batch | Package | Screen | Stitch IDs | Route | Template | Backend ready | Tests | Likely files |
|-------|---------|--------|------------|-------|----------|---------------|-------|--------------|
| — | — | — | — | — | — | — | — | **None remaining** — HQ dashboard, branch registry, and basic reports hub are **COMPLETE** (FG-08a hub). |

---

## 5 — Growth multi-branch HQ screens

| Batch | Package | Screen | Stitch IDs | Route | Template | Backend ready | Tests | Likely files |
|-------|---------|--------|------------|-------|----------|---------------|-------|--------------|
| **FG-Q11** | Growth | HQ public content oversight | D `3f316066…` · M `f2bb5e79…` (website-editor 34) | `/hq/content` (+ `/b/:branchKey`) | `content-admin/index.ejs` (HQ mount) | Yes | `content-admin` | HQ content mount EJS, `hq-admin.css` |

**Note:** Prefer running **after or with FG-Q10** (shared templates). Do not invent org-templates Stitch 60.

**Stop conditions (5):** No Network claims; no fabricated theme/domain/SEO builder.

---

## 6 — Growth advanced reports

| Batch | Package | Screen | Stitch IDs | Route | Template | Backend ready | Tests | Likely files |
|-------|---------|--------|------------|-------|----------|---------------|-------|--------------|
| **FG-Q12** | Growth | Giving report + Growth gate | Consolidated analytics D `2a577dc15d4342acb152f16aed21c267` · M `06489c79d0d04a429e57eba5c717ba47` | `/hq/reports/giving` (+ hub card labels) | `hq/giving-report.ejs`, hub card on `hq/reports.ejs` | Yes — soft `advanced_reports` | `reports-audit` | `hqReportsRoutes.js` / service (gate only), giving-report EJS, `hq-admin.css` |
| **FG-Q13** | Growth | Branch performance PLACEHOLDER | D `f6b636977d7d40b89bd4048b696a4095` · M `922867aec8474f11baff555043b86eea` | `/hq/reports` (approx) | `hq/reports.ejs` | Soft aggregates only | `reports-audit` | reports hub presentation only — **no new generators** |

**Stop conditions (6):** Do not weaken entitlement gates; no donor PII, CSV dumps, forecasts, or fabricated MoM %.

---

## 7 — Shared media and UI states

| Batch | Package | Screen | Stitch IDs | Route | Template | Backend ready | Tests | Likely files |
|-------|---------|--------|------------|-------|----------|---------------|-------|--------------|
| — | — | — | — | — | — | — | — | **None in queue** — media is `MISSING_STITCH` (Batch 22 done; Shared UI States reference only). Shared tokens/states are **COMPLETE**. |

---

## 8 — Final parity audits

| Batch | Package | Screen | Stitch IDs | Route | Template | Backend ready | Tests | Likely files |
|-------|---------|--------|------------|-------|----------|---------------|-------|--------------|
| **FG-Q14** | Both | Responsive + a11y re-audit (FG surfaces) | Sample canonical pairs from FG-Q01–Q13 | sampled | shells + changed EJS/CSS | N/A | `a11y-structure`, focused suites | shell CSS/JS, `tests/blessboard-v5-a11y-structure.test.js` |
| **FG-Q15** | Both | Final Stitch parity audit (docs) | All queued + COMPLETE map rows | — | docs only | N/A | `git diff --check` | `STITCH_SCREEN_MAP.md`, this queue, coverage |

**Stop conditions (8):** Claim **MATCHED** only with side-by-side browser ↔ Stitch evidence; tiny confirmed visual fixes only.

---

## Totals

| Metric | Count |
|--------|------:|
| Executable batches | **15** (FG-Q01–Q15) |
| Section 4 remaining | 0 |
| Section 7 remaining | 0 |
| Product-gated | FG-Q06 (create-org), FG-Q07 (prayer CTA) |

---

## Recommended Agent-window grouping

| Window | Batches | Est. focus | Notes |
|--------|---------|------------|-------|
| 1 | FG-Q01 | Apex Home D+M | Browser vs Stitch |
| 2 | FG-Q02 | Pricing + FAQ | Commercial SoT |
| 3 | FG-Q03 | Directory | Safe labels only |
| 4 | FG-Q04 | Register Church | Enquiry only |
| 5 | FG-Q05 | For Churches | Pricing decision copy |
| 6 | FG-Q08 | Ministry profile | Content-admin tests |
| 7 | FG-Q09 | Announcement preview | — |
| 8 | FG-Q10 + FG-Q11 | Website editor + HQ content | Same templates; one window OK |
| 9 | FG-Q12 | Giving report Growth gate | Mirror FG-08a attendance |
| 10 | FG-Q13 | Performance PLACEHOLDER lift | Aggregates only |
| 11 | FG-Q07 | Prayer CTA | **After product decision** — skip if deferred |
| 12 | FG-Q06 | Create-org UI | **After product unlock** — skip if CLI-only |
| 13 | FG-Q14 | Responsive/a11y | After polish windows |
| 14 | FG-Q15 | Final parity docs | Last |

**Do not** combine apex + branch admin in one window.
**Do not** start DEFERRED Growth modules (surveys, schedules, offline) in these windows.
**Do not** re-run FG-01 or FG-08a.

---

## Out of queue (see blocked / missing-Stitch docs)

| Item | Why excluded |
|------|----------------|
| Waiting verification, prayer dedicated route, departments, duty roster, monthly reports, HQ roles/templates | `MISSING_BACKEND` |
| Forgot password; scheduled comms/reports; offline attendance; surveys; appointments; volunteers | `DEFERRED` |
| Leader portal; Network domain/email/API; banking settings | `NOT_IN_SCOPE` |
| Auth error/account; BA/HQ settings; BA sermons/forms; media | `MISSING_STITCH` |
| Features; attendance report; most portal CLOSE PARITY screens | `COMPLETE` |
