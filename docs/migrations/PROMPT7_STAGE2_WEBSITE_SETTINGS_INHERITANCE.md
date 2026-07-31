# Prompt 7 Stage 2 — Identity, contact, service-time, SEO inheritance

**Status:** Implemented (local ephemeral tests).  
**Do not deploy automatically.**  
**Foundation:** Stage 1 (`052`) + Stage 2 dotted-key constraint (`053`).

## Migration

| File | Effect |
|------|--------|
| `053_website_scope_settings_dotted_keys.sql` | Relaxes `wss_setting_key_format` to allow `a-z0-9_.` keys |

No override rows invented. No CMS copy.

```bash
npm run db:identity:check   # expect blessboard-platform-v5
DATABASE_URL=… npm run db:migrate
```

## Registry

`src/blessboard/services/websiteSettingKeyRegistry.js` — controlled Stage 2 keys + typed validation.

## Resolver

`src/blessboard/services/resolveBranchWebsiteSettings.js`

Sources: `branch_override` → `branch_record` → `church_default` → `primary_branch_fallback` (church-wide service times / contact only) → `platform_fallback` → `missing` / `hidden`.

## Tests

```bash
node --test tests/blessboard-prompt7-stage2-website-settings.test.js
node --test tests/blessboard-prompt7-stage1-website-governance.test.js
```

## Deferred

Collections, giving governance, trusted publish, visual Stitch parity (Stages 4–8).  
Stage 3 editor: see `PROMPT7_STAGE3_BRANCH_WEBSITE_SETTINGS_EDITOR.md`.
