# Phase 4 Stages 6–7 — Plan Entitlements & Mobile Parity

## Verdict

`IMPLEMENTED`

## Screens (1–8)

1. Advanced Website Feature Locked — Network-required lock  
2. Website Plan Features — desktop comparison  
3. Growth Website Feature Locked — Growth-required lock  
4. Network Website Version History — Mobile (responsive cards)  
5. Advanced Website Management — Mobile markers + CSS  
6. Review Website Update — Mobile markers + stacked compare  
7. Network Approval Settings — Mobile markers + sticky save  
8. Website Plan Features — Mobile stacked cards  

## Plan / entitlement mapping

| Capability | Foundation | Growth | Network |
| --- | --- | --- | --- |
| Basic edit / preview / publish / undo | Yes | Yes | Yes |
| Change requests + approval workflow | — | Yes | Yes |
| Recent changes + restore as draft | — | Yes | Yes |
| Advanced hub | — | — | Yes |
| Network approval settings | — | — | Yes |
| Full / network version history | — | — | Yes |

Plan alias fix: `professional` / `partner` → **network** in `normalizePlanKey`.

## Locked-feature behavior

Authorized HQ without capability → Phase4 lock screen (200). POST mutations → **403** (no write). Role-unauthorized → normal 403 (not upgrade).

## Routes

- `GET /hq/website/plan-features`
- Locked via gates on: advanced, network-approval-settings, approval-settings (Growth+), change-submissions, version-history / network-version-history, recent-changes  
- CTA: `/hq/account#package`, `/hq/website/plan-features`, `/hq/website`

## Server checks added

`websitePlanEntitlementService.assertWebsiteCapability` + HTTP helper on Stage 4–5 routes.

## Shared components

- `partials/phase4-website-feature-lock.ejs`
- Thin wrappers: `phase4-advanced-website-feature-locked.ejs`, `phase4-growth-website-feature-locked.ejs`
- `phase4-website-plan-features.ejs` (desktop table + mobile cards)

## Desktop / mobile reuse

Same routes, services, CSRF, and data. Mobile via responsive CSS + `data-bb-phase4-*-mobile` markers (no mobile controllers).

## Pricing

- Growth: `GROWTH_MONTHLY_PER_BRANCH_CENTS` → `USD 14.99 per active branch / month`
- Network (this screen): **Custom** / Talk to BlessBoard (no fabricated self-serve price)

## Upgrade / enquiry destinations

`/hq/account#package`, `/hq/website/plan-features`, return `/hq/website`. No fake checkout.

## Tests

| Suite | Result |
| --- | --- |
| `phase4-website-plan-entitlements.test.js` | 13 pass |
| Regression batch (6–7 + Stages 4–5 + Phase3 change/approval/version + recent-changes) | **72 pass / 0 fail** |

## Stitch parity notes

- Lock screens match Stitch hierarchy (Growth Only vs Network Feature).  
- Plan features: three tier cards + capability matrix / mobile stacks.  
- Mobile governance: cards, sticky actions, stacked review — not squeezed desktop tables.

## Gaps

- **Billing-blocked:** no self-serve upgrade checkout  
- **Intentionally deferred:** selective restore, notification delivery, decorative Stitch regional toggles remain “Not available yet”  
- **Stitch vs copy:** user text called Growth lock “Network next”; Stitch labels Growth lock as Growth-required — **Stitch followed**

## Changed files (primary)

- `websitePlanEntitlementService.js`, `websitePlanEntitlementHttp.js`
- Routes: workflow batch C, change submissions, publication version admin
- Views: plan features, two lock screens, lock partial; mobile markers on Stage 4–5 views
- `normalizePlanKey` aliases; Growth recent-changes allows Network
- CSS `hq-admin.css?v=68`
- Tests: `phase4-website-plan-entitlements.test.js` + plan assigns in related suites
- This report
