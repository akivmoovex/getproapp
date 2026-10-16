# V2.10 Overnight QA Consolidation

Branch: `V10` (`V10-edit` local worktree)  
Local/remote SHA: `92f499fc6217ecfbe78a2bc985635aab67b8321e`  
Main: unchanged at `78c1764314501620e8f7a108095d837524db97a5`  
V9: unchanged at `037cbaa3c26453dbea0962a7a82c889c5d550007`  
Original V10 backup: `backup-v10-before-main-reset-20261017` → `5707a0f33bb4533d85bc392c447d22b3a1edcd78`

## PLATFORM

| Task | Bug | Status | Root cause | Files | Tests | Commit | Push | Blocker |
|---|---|---|---|---|---|---|---|---|
| P01 | V208-REG-01 | NEEDS_SCOPE | No defect confirmed | tracker | 24/25; unrelated stale asset assertion | `438c532e` | V10 | Test maintenance |
| P02 | V208-REG-03 | VERIFIED_PASS | None confirmed | tracker | 20/20 | `97fea1a5` | V10 | — |
| P11 | BB209-01/05/09/10, AC-NEW-01 | BLOCKED | None confirmed | tracker | 44/45; unrelated moderation fixture | `1066e5f5` | V10 | Fixture failure |
| P16 | AC-NEW-01 | BLOCKED | Supported theme wiring present; lifecycle run had unrelated CMS assertions | tracker | 9/9 isolated; combined run blocked | `d7f2e3e` | V10 | CMS assertions |

## BLESSBOARD

| Task | Bug | Status | Root cause | Files | Tests | Commit | Push | Blocker |
|---|---|---|---|---|---|---|---|---|
| P06 | BB209-03 | BLOCKED | None confirmed | tracker | Blocked by schema privacy assertion; 3 DB tests skipped | `2ce812b9` | V10 | Clean member test environment |
| P07 | BB209-10/BB-05 | VERIFIED_PASS | None confirmed | tracker | 61/61 | `255c85f7` | V10 | — |
| P08 | BB209-01 | BLOCKED | Existing markup assertion failed before media root cause | tracker | Focused image suite blocked | `0359e2fd` | V10 | Existing test failure |
| P09 | BB-03 | VERIFIED_PASS | None confirmed | tracker | 29/29 | `d4c86940` | V10 | — |
| P12 | BB209-07 | VERIFIED_PASS | None confirmed | tracker | 33/33 | `bc53ebc4` | V10 | — |
| P13 | BB209-11/BB-06 | VERIFIED_PASS | None confirmed | tracker | 74/74 | `2dbc990f` | V10 | — |
| P14 | BB209-06 | VERIFIED_PASS | None confirmed | tracker | 77/77 | `c1551b16` | V10 | — |
| P15 | BB209-05/09 | VERIFIED_PASS | None confirmed | tracker | 86/86 | `d2e66047` | V10 | — |
| P20 | BB209-02 | BLOCKED | No BB defect reproduced; shared legacy color suite failed | tracker | 6 unrelated failures | `b50e798d` | V10 | Color-system baseline |
| P21 | BB209-04 | NEEDS_SCOPE | Exact New Convert/Membership Preparation/Active Member stages are not canonical | tracker | 53/53 | `67e0d86d` | V10 | Product stage approval |
| P22 | BB209-08 | NEEDS_SCOPE | V5 prayer route is intentionally absent; legacy pastoral workflow exists | tracker | 45/45 | `f0aa50a7` | V10 | V5 module approval |
| P23 | BB-07 | VERIFIED_PASS | None confirmed | tracker | 43 passed, 3 skipped | `50a9d5a0` | V10 | — |

## ACTIVECLINIC

| Task | Bug | Status | Root cause | Files | Tests | Commit | Push | Blocker |
|---|---|---|---|---|---|---|---|---|
| P03 | AC-NEW-05/06 | VERIFIED_PASS | None confirmed | tracker | 22/22 | `677064f8` | V10 | — |
| P04 | AC-NEW-07 | NEEDS_SCOPE | Approval queue is not an existing workflow | tracker | 17/17 | `ade7b760` | V10 | Approval policy |
| P05 | AC-NEW-02 | VERIFIED_PASS | None confirmed | tracker | 42/42 | `49d09fc7` | V10 | — |
| P10 | AC-HIST-07 | VERIFIED_PASS | None confirmed | tracker | 28/28 | `7aed2bac` | V10 | — |
| P17 | AC-NEW-03/04 | VERIFIED_PASS | None confirmed | tracker | 19/19; legacy UI skipped | `d4dbb576` | V10 | Legacy utilities |
| P18 | AC-HIST-03/04 | VERIFIED_PASS | None confirmed | tracker | 28/28 | `6b7fd1e6` | V10 | — |
| P19 | AC-HIST-02 | VERIFIED_PASS | None confirmed | tracker | 22/22 | `52b02386` | V10 | — |
| P24 | AC-HIST-06 | VERIFIED_PASS | None confirmed | tracker | 25/25 | `92f499fc` | V10 | — |

## Consolidated result

- Fixed bugs: none; no product-code defect was confirmed.
- Verified working: editor lifecycle, publishing/version isolation, member access, diagnostics, recovery, inquiry routing, booking, directory, mobile contracts, service publishing, invitations, announcements, branch capacity, and pastoral privacy.
- Unresolved: P01, P06, P08, P11, P16, P20 are blocked by existing test/fixture limitations.
- Separate approval required: P04 patient approval policy; P21 canonical journey-stage mapping; P22 V5 prayer module.
- Shared platform reuse: common website editor/media/publishing, tenant scoping, auth/RBAC, CSRF, and public-resolution infrastructure were reused and verified across products.
- Test limitations: no full npm suite; bounded focused tests only; isolated DB fixtures; several legacy/integration cases skipped or blocked by pre-existing assertions.
- V2.10 release blockers: blocked QA items above and unresolved scope decisions; no deployment performed.

## Safety validation

- Worktree clean; local and remote V10 match.
- Main and V9 were not modified.
- Backup tag remains preserved and resolves to the old V10 SHA.
- No product code, production data, migrations, or deployment changed.
