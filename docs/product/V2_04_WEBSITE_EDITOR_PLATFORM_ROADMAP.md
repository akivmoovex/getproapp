# V2.04 Website Editor — Platform Consolidation Roadmap

**Mode:** Planning only — **DO NOT IMPLEMENT YET**.  
**Date:** 2026-10-02  
**Input:** `docs/product/V2_04_AC_BB_WEBSITE_EDITOR_COMPARISON.md`  
**Constraint:** Preserve separate BlessBoard and ActiveClinic design tokens / branding.  
**Constraint:** Do not merge clinical doctors with church leaders as domain entities.

---

## Goal

Finish **one** shared Website Studio editing experience (WE01 + Change Manager + media + lifecycle) consumed by AC and BB adapters, while keeping **product-specific content** (catalogue vs ministries/events, single clinic vs HQ/branch multi-site) separate.

---

## Non-goals

- Building a Stitch “three-pane Web Studio” as the daily editor  
- True device/UA emulation or a z-order Layers panel  
- Forcing AC multi-site websites or BB clinical catalogues  
- Rebranding either product’s visual identity  

---

## PHASE 1 — Shared navigation and editor entry

**Intent:** One entry model: Hub (management) → Edit Website (canonical public edit) → Preview.

| Work item | Home | Source gap |
|-----------|------|------------|
| Keep canonical edit URL builders (`website_edit=1` + `website_mode=draft`) | PLATFORM | Comparison #1–2, #27 |
| Ensure BB/AC hubs stay **management-only** (no fake editor canvas) | PLATFORM + product hubs | A3; AC-WEB-EDITOR-01 pattern |
| Align public entry chrome labels (Manage / Preview / Edit) | PLATFORM | B3 |
| Thin shared chrome options object; shrink duplicate attach modules | PLATFORM | §D chrome duplication |

**Exit criteria:** Both products open the same WE01 shell from hub CTA and post-reg CTA; hubs never claim to be the visual editor.

**Priority mix:** P1 (hub clarity, CTA) · P2 (label polish)

---

## PHASE 2 — Shared responsive viewport controls

**Intent:** Desktop / Tablet / Mobile preview widths behave identically and are regression-locked.

| Work item | Home | Source gap |
|-----------|------|------------|
| Shared viewport toggle behavior + CSS width classes | PLATFORM | #3–6 |
| Shared automated click/switch tests (not markup-only) | PLATFORM | F viewport tests |
| Document “preview widths ≠ device emulation” | PLATFORM | #6 / NON-GOAL |

**Exit criteria:** One suite proves viewport class switches for BB and AC public edit.

**Priority mix:** P2

---

## PHASE 3 — Shared draft / unpublished-change UX

**Intent:** Draft save, pending count, unpublished panel, discard/revert, preview banner are one Change Manager UX.

| Work item | Home | Source gap |
|-----------|------|------------|
| Prefer engine draft SoT; reduce BB overlay dual-write | PLATFORM + BB adapter | #10 · §D overlays |
| Shared pending pill / panel / reminder semantics | PLATFORM | #11–12 |
| Shared submit-for-review UX when policy requires | PLATFORM + product policy | B1 · #14 |
| Shared publish/unpublish confirm + error diagnostics | PLATFORM | B2 · #15 · F unpublish |

**Exit criteria:** Unpublished count matches engine diffs on BB and AC; no silent publish; review path usable when enabled.

**Priority mix:** P1

---

## PHASE 4 — Shared media / history / restore patterns

**Intent:** One image dialog contract + one version/restore story.

| Work item | Home | Source gap |
|-----------|------|------------|
| Universal image payload (URL string + object) accepted consistently | PLATFORM | A2 · #19–20 |
| Close BB public image pencil coverage to AC pattern | BB adapter on shared dialog | A1 · #7 |
| Platform versions as SoT; retire dual BB version stores over time | PLATFORM + BB | #23 · §D |
| Restore-as-new-draft only (never silent live overwrite) | PLATFORM | #24 |
| Field history restore remains shared overlay | PLATFORM | #23–24 |

**Exit criteria:** Upload/replace/remove/reuse + restore-as-draft pass shared tests on both products.

**Priority mix:** P1

---

## PHASE 5 — Product-specific content adapters

**Intent:** Keep domains separate; share presentation contracts only.

| Work item | Home | Source gap |
|-----------|------|------------|
| AC catalogue (doctors/services) + operational affordances | AC | #8, #29–30, #40 |
| AC FAQ / collection editor | AC | #8 |
| BB leadership / ministries / events / sermons / giving structured editors | BB | #8, #34 |
| BB HQ/branch multi-site scope rules | BB | #25–26, #38 · B4 |
| Canonical shared field vocabulary for contact/location/SEO/footer | PLATFORM | #31–32 |
| Hours *presentation* component; clinic hours vs church service-times adapters | PLATFORM + AC/BB | #33 |
| Preserve `[data-product]` branding tokens | PLATFORM theme | Non-negotiable |

**Exit criteria:** No domain merge; adapters documented; shared presentation components reused where vocabulary matches.

**Priority mix:** P2 (except branding = always)

---

## PHASE 6 — Regression / test consolidation

**Intent:** One editor feature→test matrix with product rows.

| Work item | Home | Source gap |
|-----------|------|------------|
| Shared normalized matrix (40 features) as living checklist | PLATFORM docs/tests | #39 · A4 |
| Port AC wave coverage patterns to BB surfaces | PLATFORM + BB | A1, A4 |
| Shared suites: entry, viewport, draft, preview, publish, unpublish, media, history, restore, authz, cross-tenant | PLATFORM | F table |
| Product suites only for catalogue (AC) and structured church CMS / multi-site (BB) | AC / BB | §E |

**Exit criteria:** `SHARED_EDITOR_REGRESSION` suite green for both products; product-only suites remain thin.

**Priority mix:** P1

---

## Suggested sequencing

```
PHASE 1 (entry/hub)
    → PHASE 3 (draft/publish UX)   // parallel-safe with PHASE 2
    → PHASE 2 (viewports)
    → PHASE 4 (media/history)
    → PHASE 5 (adapters; ongoing)
    → PHASE 6 (tests; start early, finish last)
```

Phases 2 and 6 can start spike work in parallel with Phase 1 once entry URLs are frozen.

---

## Capacity hints (non-binding)

| Phase | Relative effort | Risk |
|------:|-----------------|------|
| 1 | S | Low — mostly alignment |
| 2 | S | Low |
| 3 | M | Medium — BB overlay retirement |
| 4 | M–L | Medium — image contract + BB coverage |
| 5 | L (ongoing) | Low if domains stay separate |
| 6 | M | Low–medium — suite design |

---

## Tracking back to comparison footer

| Comparison metric | Roadmap handling |
|-------------------|------------------|
| BB_PARITY_GAPS (6) | Phases 1, 3, 4, 6 (A1–A6) |
| AC_PARITY_GAPS (4) | Phases 1, 3 (B1–B3); B4 only if AC multi-site ever approved |
| DUPLICATED_TO_CONSOLIDATE (5) | Phases 1, 3, 4, 6 |
| SHARED_PLATFORM (28) | Preserve; extend tests only |
| P0=0 | No emergency track |
| P1=7 / P2=4 | P1 in Phases 1/3/4/6; P2 in 2/5 |

---

## Footer

```
ROADMAP_PHASES=6
IMPLEMENTATION=NOT_STARTED
BRANDING_PRESERVED=YES
DOMAIN_MERGE=FORBIDDEN
FINAL=WEBSITE_EDITOR_PLATFORM_ROADMAP_READY
```
