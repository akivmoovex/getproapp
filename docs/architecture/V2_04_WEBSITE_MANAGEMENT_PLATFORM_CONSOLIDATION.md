# V2.04 Website Management Platform Consolidation

**Mode:** Safe consolidation — no deploy, no production, no product-token merge.  
**Date:** 2026-10-02

## Target architecture

### PLATFORM (shared)

- Feature contract registry: `websiteManagementFeatureContract.js`
- Hub UX presentation: `websiteManagementPresentation.js`
- Lifecycle / content / versions / media: existing `src/platform/website/*`
- Editor engine + viewport: `src/platform/website-engine/*` (`editorViewportFrame`, chrome, change manager)
- Shared components / inline editor: `presentation` + `public/platform/website-inline-edit.js`

### PRODUCT ADAPTERS

| Product | Owns | Does not own |
|---------|------|--------------|
| ActiveClinic | `/app/settings/website/*` CMS, Services/Doctors catalogue, AC tokens | BB ministries/sermons, platform draft engine |
| BlessBoard | `/hq/website` hub, classic `/hq/content` pages, Leadership/Ministries/Events/Sermons/Giving, BB tokens | AC navigation/chrome CMS screens, AC content-library items |

## Duplication classification (this pack)

| Area | Classification | Action |
|------|----------------|--------|
| Feature option lists (AC vs BB) | MOVE_TO_PLATFORM | Centralized in feature contract |
| Hub missing BB branding/library/settings tiles | ALREADY_SHARED actions, BB UI gap | Fixed BB hub tiles |
| Responsive viewport | ALREADY_SHARED | Preserved |
| Publish/version/media engines | ALREADY_SHARED | Preserved |
| Navigation / Chrome managers | KEEP_PRODUCT_SPECIFIC (AC) | Documented AC_ONLY_BY_DESIGN |
| Content library CMS items | KEEP_PRODUCT_SPECIFIC (AC) | BB media reuse path documented |
| Design tokens | KEEP_PRODUCT_SPECIFIC | Not merged |

**DUPLICATIONS_MOVED_TO_PLATFORM=1** (feature registry)  
**PRODUCT_ADAPTERS_RETAINED=2** (AC + BB)

## What was not done (by design)

- No broad rewrite of AC CMS ↔ BB classic CMS into one UI
- No forcing Services/Doctors into BlessBoard
- No forcing Leadership/Ministries into ActiveClinic
- No migration / production changes
- No deploy

## Verification

Run:

```bash
node --test tests/v2-04-website-management-platform-contract.test.js \
  tests/v2-04-website-editor-real-viewport.test.js \
  tests/v2-04-ac-catalogue-gui-shell-fix.test.js \
  tests/v2-04-ac-website-admin-blank-page.test.js \
  tests/v2-04-final-engineering-defect-pack.test.js
```

Preserved recent fixes must remain green.
