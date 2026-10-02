# Phase 4 Stage 8A — Shared Empty, Error, and Restricted States

## Verdict

**IMPLEMENTED**

Shared system-state foundation for the final Phase 4 Stitch screens. Workflow-map screens were not implemented.

## Shared state component

| Piece | Path |
| --- | --- |
| Partial | `views/blessboard/v5/partials/phase4-system-state.ejs` |
| Full-page shell | `views/blessboard/v5/hq/phase4-system-state-page.ejs` |
| Builders / gate | `src/blessboard/http/websiteSystemStateHttp.js` |
| Styles | `public/blessboard/v5/hq-admin.css` (`.bb-hq-phase4-sys*`) |

State types: `empty` · `error` · `restricted` · `locked` · `not_found`

Supports icon, heading (optional eyebrow `title`), body, primary/secondary actions, hint, ARIA role by type, and mobile stacking via the same model (`data-bb-phase4-system-state-mobile`).

## Routes updated

1. **Change requests** — `websiteChangeSubmissionAdminRoutes.js` + `phase4-website-change-requests.ejs`  
   - Success + zero rows → shared empty state (Stitch “All caught up!”).  
   - Lookup failure → error system state (503), not empty.
2. **Version history** — `websitePublicationVersionAdminRoutes.js` + `phase4-network-website-version-history.ejs`  
   - Load failure → full-page error state with retry preserving query string.  
   - Empty history → distinct empty system state.
3. **Network governance role gate** — `createNetworkGovernanceRoleGate` on:  
   - `websiteWorkflowBatchCAdminRoutes.js` (advanced, network approval, plan features, workflow)  
   - `websitePublicationVersionAdminRoutes.js` (version history / restore / recent changes HQ gates)  
   - Wrong HQ role → restricted system state (403).  
   - Missing Network entitlement → existing feature-lock screens (unchanged).  
   - Cross-tenant / unauthorized → plain denial (no resource leak, no upgrade).

## Distinctions

| Condition | Behavior |
| --- | --- |
| Empty result | Success path, zero authorized rows → `empty` |
| Loading failure | Service/repo error → `error` + log; never shown as empty |
| Wrong role | `restricted` (no plan upgrade CTA) |
| Missing entitlement | Existing `locked` feature screens |
| Cross-tenant | Deny without resource details |
| Feature disabled / not found | Unchanged prior conventions |

## Tests

```text
node --test tests/phase4-system-states.test.js
# tests 11
# pass 11
# fail 0
```

Regression spot-checks: plan entitlements suite (incl. branch admin ≠ upgrade) and phase3 change-submissions suite — all passed.

## Stitch parity notes

| Screen | Notes |
| --- | --- |
| Change Requests Empty (+ Mobile) | Copy and actions match (“All caught up!”, View Request History, Refresh Queue). Same route/model for desktop and mobile CSS. |
| Version History Loading Error | Heading/body/retry aligned; **did not** render Stitch “Error Code: VH_SYNC_FAILED_503” (unsafe diagnostics). |
| Network Governance Access Restricted | Role messaging + Return to Dashboard; **did not** render `SYSTEM_REF` / “Authenticated as …” diagnostics. Secondary uses Website Overview (no mail override flow). Hint clarifies buying a plan does not grant a role. |

## Changed files

- `src/blessboard/http/websiteSystemStateHttp.js` (new)
- `src/blessboard/http/websiteChangeSubmissionAdminRoutes.js`
- `src/blessboard/http/websitePublicationVersionAdminRoutes.js`
- `src/blessboard/http/websiteWorkflowBatchCAdminRoutes.js`
- `views/blessboard/v5/partials/phase4-system-state.ejs` (new)
- `views/blessboard/v5/hq/phase4-system-state-page.ejs` (new)
- `views/blessboard/v5/hq/phase4-website-change-requests.ejs`
- `views/blessboard/v5/hq/phase4-network-website-version-history.ejs`
- `views/blessboard/v5/partials/hq-shell-start.ejs` (`hq-admin.css?v=69`)
- `public/blessboard/v5/hq-admin.css`
- `tests/phase4-system-states.test.js` (new)
- `PHASE4_STAGE8A_SYSTEM_STATES_IMPLEMENTATION.md` (this report)

## Remaining blockers

None for Stage 8A. Workflow-map screens remain out of scope for a later stage.
