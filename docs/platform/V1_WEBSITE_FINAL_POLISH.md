# V1 website — final polish before production

Closes or reclassifies the two MEDIUM issues raised by the manual browser QA of
`809aa35dfb7a9ec4190df1f1fac2f0a11c76fdcb`
(`V1_WEBSITE_MANUAL_QA_PASS_WITH_KNOWN_DEBT`).

Scope was limited to those two items. No features were added, no shared
website-engine logic was refactored, and production was not touched.

## MEDIUM 1 — ActiveClinic Publish clipped at 360px — FIXED

**Symptom.** At 360px the Website Management chrome cut the **Publish** button
mid-word on Website Management, Media and SEO. 390px was unaffected. The SEO
page also produced 3px of horizontal document overflow.

**Root cause (two independent causes, both in `public/activeclinic/website-cms.css`).**

1. The editor chrome element carries both `ac-mw-editor` and `ac-mw-nav`. Only
   `.ac-mw-nav` defines layout, giving the wrapper `display: flex`, and the
   computed `flex-wrap` was `nowrap`. The sticky header `.ac-mw-editor__top` and
   the tools rail `.ac-mw-editor__rail` were therefore laid out **side by side in
   one row** even below the `899px` breakpoint that was supposed to stack them.
   At 360px the header's natural width (337px) exceeded its squeezed flex
   container (304px) and an ancestor `overflow-x: clip` hid the remainder — so
   the trailing action was cut. This also stretched the header to 435px tall,
   which was the separately reported "tall mostly-empty dark panel".
2. On the SEO page `.ac-mw-brand-layout` used `grid-template-columns: 1fr`.
   `1fr` keeps an `auto` (min-content) minimum, so a wide child could push the
   column past the viewport, producing the 3px overflow.

**Fix.** Inside the existing `@media (max-width: 899px)` block the wrapper now
stacks (`display: block`), the header wraps (`flex-wrap: wrap`) with a tighter
mobile gap/padding, and the action group keeps `margin-left: auto` while being
allowed to drop to its own row. The mobile grid column became
`minmax(0, 1fr)` — the convention already used elsewhere in this file — with
`overflow-wrap: anywhere` on the preview cards.

No per-page overrides, no font shrinking, and nothing is hidden: when the labels
cannot fit on one line the actions wrap onto a second, fully visible row, which
also absorbs longer translated labels.

**Measured result** (`documentElement.scrollWidth` / viewport, Publish box):

| Width | Before | After |
|---|---|---|
| 360 | header 435px tall, rail at x=359, SEO overflow 363/360 | header 88px, rail x=16 full width, **360/360**, Publish right=306 fully inside |
| 390 | header 435px tall, rail at x=359 | header 56px, **390/390**, Publish right=336 |
| 768 | header 56px | **768/768**, Publish right=714 |
| 1440 | unchanged | unchanged — the breakpoint does not apply; float rail intact |

`SHELL_ASSET_VERSION` moved `v7-proj106-1` → `v7-proj106-2` so the corrected CSS
is not served from cache; the three suites that pin that literal were updated
with it.

## MEDIUM 2 — BlessBoard "Approve & Publish" — RECLASSIFIED, Option A

**Decision: the two-step APPROVE → PUBLISH workflow is intentional.** The
one-click control is not implemented and was deliberately deferred, so no
publication behaviour was added.

Evidence, from `PHASE4_STAGES4_5_WEBSITE_GOVERNANCE_IMPLEMENTATION.md`:

- "**Intentionally deferred:** … approve-and-publish-now content apply"
- "**Stitch:** 'Approve & Publish' shown disabled; Approve → publish review
  remains separate"

Stitch — the visual source of truth — shows the control present but disabled, so
it was kept visible rather than removed, and instead made unambiguous.

**Change** (`views/blessboard/v5/hq/phase4-review-website-update.ejs`, the only
routed review view; `phase3-website-change-review.ejs` is superseded and
unrouted, so it was left alone):

- The disabled button is now labelled **"Approve & Publish (not available yet)"**
  so its state is visible without hovering. The reason moved from a `title`
  tooltip — invisible to touch users — into visible copy referenced by
  `aria-describedby`, so assistive technology receives it too.
- The workflow note now spells out the two steps explicitly: approve here, then
  publish from Publish Website Review, and approval alone never changes the live
  website.
- `public/blessboard/v5/hq-admin.css` had **no disabled state at all** for
  `.bb-hq-btn`, and its `:hover` rule applied to disabled buttons too — so the
  inert control lit up on hover and otherwise looked identical to an actionable
  one. Added a `:disabled` affordance (`opacity: 0.5; cursor: not-allowed`) and
  excluded disabled buttons from `:hover`. This is a design-system gap rather
  than a per-page override, so every inert HQ button benefits.
  `hq-shell-start.ejs` cache-buster moved `?v=76` → `?v=77`.

**Reclassified: `PRODUCT_DIFFERENCE / LOW`.** The publish chain itself was
verified working end to end during QA: branch draft → submit → HQ approve → HQ
branch publish put the branch page live while HQ and sibling branches stayed
unchanged.

## LOW items — deferred to V1.1

| Item | Disposition |
|---|---|
| ActiveClinic mobile editor rail tall/mostly empty | **Resolved incidentally** by MEDIUM 1 cause 1 — the rail no longer stretches to match a side-by-side header (435px → natural height). |
| Secondary navigation text links below the 44px touch guideline | Deferred to V1.1. Affects secondary nav text links across both products; primary controls already meet the guideline. Touching shared shell typography during a QA freeze is not justified. |
| BlessBoard folder deletion not exercised with a live asset | Deferred to V1.1 as **test coverage**, not a product gap. Both products call the same `mediaFoldersService.deleteFolder`, whose `folder_id` foreign key is `ON DELETE SET NULL`; ActiveClinic exercised the full create → move → delete path in QA and the asset survived in Unfiled. BlessBoard's library holds no files, and uploads there only occur through a section editor's media modal. |

## Verification

Curated regression set: **344 tests / 51 suites, 344 pass, 0 fail, 0 skip**,
covering ActiveClinic website/CMS, mobile contracts, Stitch/project-106 parity,
accessibility, the shared website engine, BlessBoard publish/review, RBAC,
tenant isolation and branch/HQ isolation.

Supplementary batch: **150 tests / 26 suites, 149 pass, 0 fail, 1 skip**. The
skip is `church-branch-website-editor` → "branch website editor draft, preview,
and publish", gated on `skip: !isPgConfigured()` — local Postgres availability,
unrelated to these changes.

`REGRESSION_FAILURES = 0`.

Because this pass touched `hq-admin.css` and the HQ shell partial, two suites
outside the website core were also run: `blessboard-v5-a11y-structure` and
`blessboard-platform-admin-mobile-nav`, which fail 6 assertions. A stashed
baseline worktree at the same commit produces the **identical** 6 failures
(97 pass / 6 fail either way), and all six assert against platform-admin
(`bb-pa-*`) surfaces — drawer nav, `platform-admin.css` cache-bust pairing and
platform-admin Stitch parity — not website surfaces. Registered as record 11 in
`V1_TEST_DEBT_TRIAGE.md`.

Known unrelated debt is unchanged: `blessboard rbac e2e` → "positive member
journey completes through cell/class/department" (record 10 in
`V1_TEST_DEBT_TRIAGE.md`), pre-existing on baseline `d806188` and touching no
website code.
