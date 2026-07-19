# Batch FG-01 — Apex Features

**Date:** 2026-07-19  
**Batch ID:** FG-01  
**Package:** Platform / Foundation commercial  
**Companion:** [`FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md`](./FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md) · [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md)

## 1. Canonical Stitch IDs

| Viewport | Screen ID | Exact title |
|----------|-----------|-------------|
| Desktop | `7ef3518f23a0400098d810f617dd0cc0` | BlessBoard - Features (Desktop) |
| Mobile | `5ac1e1b0600b4bc78f945e36b56aaece` | BlessBoard - Features (Mobile) |

## 2. Routes preserved

| Route | Method | Change |
|-------|--------|--------|
| `/features` | GET | Presentation only — path, apex-only gate, no POST |

No CSRF forms on this page. Authorization unchanged (public apex marketing).

## 3. Files changed

- `views/blessboard/v5/apex/features.ejs` — Stitch section order/chrome; `data-bb-batch="fg-01"`
- `public/blessboard/v5/apex.css` — Features hero, media, cards, CTA band, mobile CTA widths
- `views/blessboard/v5/partials/apex-shell-start.ejs` — `apex.css?v=7`
- `tests/blessboard-apex-marketing.test.js` — FG-01 markers + omitted Stitch fabrications
- `docs/gui/BATCH_FG01_APEX_FEATURES.md` — this file

## 4. Data used

| Asset | Source |
|-------|--------|
| Section copy | Stitch titles + V5-safe capability wording |
| Images | Existing local `/church/images/homepage/apex-feature-*.jpg` |
| CTAs | `/register-church`, `/pricing`, `/login` or `/account` |

No DB queries on Features. No fabricated church counts, giving totals, or attendance %.

## 5. Unsupported elements omitted

- Start Free Trial / Watch Product Tour / Schedule a Demo / Contact Enterprise Sales  
- “Join over N churches…” social proof  
- KPI widgets (+12% attendance, $42k giving, New Visitors)  
- Payment gateway / text-to-give / recurring donation product claims  
- Drag-and-drop CMS / Live Preview Editor claims  
- SSO / bank-grade compliance marketing as live V5 features  
- Custom domain as Foundation/Growth self-serve (labeled Network + assisted)

## 6. Responsive status

| Width | Expectation | Status |
|-------|-------------|--------|
| 320px | No horizontal overflow; full-width CTAs | Static CSS guards (`overflow-x: clip`, 100% CTAs ≤374px) |
| 375px | Stacked media/copy; usable CTAs | Stack via single-column grid &lt;768px |
| 768px | Two-column splits; 2×2 engagement cards | Existing + Features media polish |
| 1440px | Contained max-width; hero/lead readable | Container + clamp typography |

Browser pixel QA against live Hostinger not run in this batch (static CSS + tests only).

## 7. Backend behavior confirmation

- Route still apex-only (`404` on non-apex Host) — covered by existing marketing test  
- No new services, schema, or env vars  
- Shell, tokens (Hanken / `#6C5CE7`), Powered by GetPro footer unchanged  

## 8. Tests

```text
npm run test:blessboard:apex-marketing     → 7 pass / 0 fail
npm run test:blessboard:apex-auth-gui      → 4 pass / 0 fail
npm run test:blessboard:a11y-structure     → 87 pass / 0 fail
npm run test:blessboard:csrf-action-audit  → 7 pass / 0 fail
npx stylelint public/blessboard/v5/apex.css → 0 errors, 131 warnings (pre-existing color-no-hex)
git diff --check (batch files)             → clean
```

Authorization: Features is public apex marketing (no role gate). Apex-only Host rejection covered in marketing suite.

## 9. Remaining gaps

- Visual MATCHED vs Stitch not claimed (composition closer; stock photos ≠ Stitch mock UI chrome)  
- Mobile Stitch “Platform Features” alternate hero eyebrow not adopted (kept “Features” for nav consistency)  
- Directory / Pricing / Register batches still FG-02+  

## 10. Suggested commit message

```
Polish apex Features page to canonical Stitch desktop/mobile pair.
```
