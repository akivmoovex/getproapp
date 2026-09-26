# V2.01 Shared Editor — P2 Gap Closure QA

**Task:** `V2_01_SHARED_EDITOR_P2_GAP_CLOSURE`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Target:** `moovex-platform-v8-testing` only  
**Production:** **untouched** — do not promote

**Refs:**  
- `docs/qa/V2_01_SHARED_WEBSITE_EDITOR_FINAL_QA.md` (P2 residuals omitted from final integrated QA)  
- `docs/qa/V2_01_UNIVERSAL_IMAGE_EDITOR_QA.md`  
- `docs/qa/V2_01_SHARED_HQ_BRANCH_WEBSITE_QA.md`

**Personas (disposable):**  
- BB `bb-v8qa-mub23a6v6a6b`  
- AC `ac-v8-qa-mub23a6v6a6b`

**Harness:** `scripts/local/_tmp_v2_01_p2_gap_closure_qa.js`  
**Stamp:** `P2GAP-muhm5lik`  
**Result summary:** **48 / 48 PASS** · fail 0 · blocked 0 · not tested 0

---

## FINAL VERDICT

**`V2_01_SHARED_EDITOR_P2_GAPS_CLOSED`**

The three P2 scenarios omitted from the final integrated editor QA were re-run on hosted V8 testing for both BlessBoard and ActiveClinic: image upload/library/Adjust Picture (desktop + 390), field-history restore POST (including stale rejection), and structured item mutation (BB ministry + AC catalogue doctor). No application code changes. Production remained on `03a89106e2fe` / `moovex-platform-production`.

---

## 1. Precheck

| Check | Result | Detail |
| --- | --- | --- |
| Hosted BB SHA | **PASS** | `580e760e77be` |
| Hosted AC SHA | **PASS** | `580e760e77be` (match) |
| Deployment identity | **PASS** | `moovex-platform-v8-testing` · `environment=testing` · `mediaWriteNamespace=testing-v8` · `expectedIdentityKey=moovex-platform-v7` |
| Report-only commit `580e760e` | **PASS** | Docs + test cache-bump assertion only (`V2_01_SHARED_WEBSITE_EDITOR_FINAL_QA.md` + `tests/v2-01-universal-image-editor.test.js`). **No application behavior change.** |
| Hosted code vs tested tip | **PASS** | Hosted tip **is** `580e760e77be` — same as report commit; functional editor tip remains the prior `c00dce00` line with this docs/test tip on top |
| Production | **PASS** | `blessboard.com` `03a89106e2fe` / `moovex-platform-production` |

---

## 2. Image upload and crop

Browser Playwright on disposable BB + AC. Evidence under `docs/qa/references/v2-01-p2-gap-closure/`.

### BlessBoard

| Step | Result | Evidence / notes |
| --- | --- | --- |
| Upload via browser file input | **PASS** | `uploaded_file` |
| Choose existing from Image Library | **PASS** | `opened_library` → `picked_library` |
| Open Adjust Picture / framing | **PASS** | Desktop + Mobile modes; zoom `1.35` / mobile `1.25` |
| Save draft → refresh → reopen | **PASS** | Placement persisted (`zoom:1.35` + mobile blob) |
| Preview + publish | **PASS** | `previewed` · `publish_clicked` |
| Public rendering | **PASS** | `bb-public.png` · `public_checked` |
| Original CDN unchanged | **PASS** | Framing is placement metadata only; `cdn_asset_identity_ok` |
| Desktop + 390px | **PASS** | `bb-desktop-framing.png` · `bb-390-framing.png` |

### ActiveClinic

| Step | Result | Evidence / notes |
| --- | --- | --- |
| Upload via browser file input | **PASS** | `uploaded_file` |
| Choose existing from Image Library | **PASS** | `opened_library` → `picked_library` |
| Open Adjust Picture / framing | **PASS** | Desktop + Mobile; zoom `1.35` / mobile `1.25` |
| Save draft → refresh → reopen | **PASS** | Placement persisted (`zoom:1.35` + mobile) |
| Preview + publish | **PASS** | `previewed` · `publish_clicked` |
| Public rendering | **PASS** | `ac-public.png` · `public_checked` |
| Original CDN unchanged | **PASS** | Placement-only framing contract |
| Desktop + 390px | **PASS** | `ac-desktop-framing.png` · `ac-390-framing.png` |

**Scenario verdict:** **PASS** (BB + AC)

---

## 3. Field restore

API + draft/live checks on disposable tenants. Restore choice: `currently_published`. Stale `expectedUpdatedAt` must 409.

### BlessBoard (`home.hero.heading`)

| Step | Result | Detail |
| --- | --- | --- |
| Seed published + overlay draft | **PASS** | Draft over published; live shows published only |
| Field History open | **PASS** | `200` |
| Restore POST `currently_published` | **PASS** | `200` · `ok` · `published=false` (draft write only) |
| Only selected field changes | **PASS** | Unrelated `home.hero.bodyText` draft preserved |
| Live unchanged after restore | **PASS** | No draft leak on public HQ |
| Stale restore rejected | **PASS** | `409` · `conflict` |
| Preview + publish restored | **PASS** | Preview `200` · publish `303` |

### ActiveClinic (`home.hero.title`)

| Step | Result | Detail |
| --- | --- | --- |
| Seed published + overlay draft | **PASS** | `saved_to_draft` (AC key is `title`, not BB `heading`) |
| Field History open | **PASS** | `200` |
| Restore POST `currently_published` | **PASS** | `200` · `ok` · `published=false` |
| Only selected field changes | **PASS** | Unrelated `home.hero.subtitle` draft preserved |
| Live unchanged after restore | **PASS** | Published value present; draft not leaked |
| Stale restore rejected | **PASS** | `409` · `conflict` |
| Preview + publish restored | **PASS** | Preview `200` · publish `303` |

**Scenario verdict:** **PASS** (BB + AC)

---

## 4. Structured item mutation

### BlessBoard — ministry structured draft

| Step | Result | Detail |
| --- | --- | --- |
| Add ministry | **PASS** | entity `qa-p2-ministry-P2GAP-muhm5lik` |
| Edit same entity ID | **PASS** | Stable `entityKey` on upsert |
| Unrelated items | **PASS** | Upsert scoped to entity key |
| Anon / unauthorized mutation | **PASS** | `401` |
| Save / publish / public marker | **PASS** | Publish `303` · public/preview marker found |

### ActiveClinic — catalogue doctor

| Step | Result | Detail |
| --- | --- | --- |
| Open collection / catalogue path | **PASS** | Services edit page + catalogue doctor form |
| Create doctor | **PASS** | `303` → catalogue `saved=1` |
| Edit same doctor ID | **PASS** | id `07456c56-f7e4-41fc-af16-f682918ab715` · `saved=1` |
| Catalogue marker | **PASS** | Stamp present on catalogue tab |
| Public rendering | **PASS** | Stamp on public `/doctors` after publish |
| Anon / unauthorized mutation | **PASS** | Draft POST `403` |

**Scenario verdict:** **PASS** (BB + AC)

---

## 5. Evidence index

| File | Product | What |
| --- | --- | --- |
| `docs/qa/references/v2-01-p2-gap-closure/bb-editor-open.png` | BB | Image editor open |
| `docs/qa/references/v2-01-p2-gap-closure/bb-desktop-framing.png` | BB | Adjust Picture desktop |
| `docs/qa/references/v2-01-p2-gap-closure/bb-390-framing.png` | BB | 390 framing |
| `docs/qa/references/v2-01-p2-gap-closure/bb-preview.png` | BB | Draft preview |
| `docs/qa/references/v2-01-p2-gap-closure/bb-public.png` | BB | Public after publish |
| `docs/qa/references/v2-01-p2-gap-closure/ac-editor-open.png` | AC | Image editor open |
| `docs/qa/references/v2-01-p2-gap-closure/ac-desktop-framing.png` | AC | Adjust Picture desktop |
| `docs/qa/references/v2-01-p2-gap-closure/ac-390-framing.png` | AC | 390 framing |
| `docs/qa/references/v2-01-p2-gap-closure/ac-preview.png` | AC | Draft preview |
| `docs/qa/references/v2-01-p2-gap-closure/ac-public.png` | AC | Public after publish |

---

## 6. Exact remaining gaps

None blocking for the three P2 scenarios on this tip.

Non-blocking notes (not failures):

1. AC public doctors listing depends on catalogue `publicWebsiteVisible` + website publish — verified this run; empty clinic catalogues may need the same flags.  
2. Editor chrome `data-gp-website-editor` can report Playwright `visible=false` (height 0 shell); pencils remain the reliable attach signal.  
3. No new product features or refactors were introduced in this task (QA harness + this report only).

---

## 7. Production untouched confirmation

| Host | SHA | Deployment |
| --- | --- | --- |
| `blessboard.com` | `03a89106e2fe` | `moovex-platform-production` |
| V8 testing BB/AC | `580e760e77be` | `moovex-platform-v8-testing` |

No production host, DB, media root, or deployment profile was modified. All writes used disposable V8 testing tenants only.

---

## Verdict line

`V2_01_SHARED_EDITOR_P2_GAPS_CLOSED`
