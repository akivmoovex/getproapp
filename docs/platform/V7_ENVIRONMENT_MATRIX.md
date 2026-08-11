# V7 Environment / Deployment Matrix

## Preferred unified runtimes

| Deployment code | Product selection | Environment | DB identity key | DB env |
| --------------- | ----------------- | ----------- | --------------- | ------ |
| `moovex-platform-testing` | hostname | testing | `moovex-platform-v7` | testing |
| `moovex-platform-production` | hostname | production | `moovex-platform-v7` | production |

## Transitional product-specific profiles (still registered)

| Deployment code | Product | Env | Domain | Status |
| --------------- | ------- | --- | ------ | ------ |
| `blessboard-com-production` | blessboard | production | blessboard.com | transitional → moovex-platform-production |
| `blessboard-pronline-testing` | blessboard | testing | blessboard.pronline.org | transitional → moovex-platform-testing |
| `blessboard-org-staging` | blessboard | testing | blessboard.org | legacy |
| `activeclinic-org-production` | activeclinic | production | activeclinic.org | transitional |
| `activeclinic-pronline-testing` | activeclinic | testing | activeclinic.pronline.org | transitional |
| `activeclinic-org-v6` | activeclinic | testing | activeclinic.org | legacy |
| `getproapp-org-production` | getpro | production | getproapp.org | transitional |
| `getpro-pronline-testing` | getpro | testing | getpro.pronline.org | transitional |
| `netraz-org-production` | ngo | production | netraz.org | transitional |
| `netraz-pronline-testing` | ngo | testing | netraz.pronline.org | transitional |
| `moovex-org-production` | corporate | production | moovex.org | transitional |

## Hostinger values (apply later — not applied)

### Preferred testing

```env
NODE_ENV=production
DEPLOYMENT_ENV=testing
PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing
DATABASE_URL=<testing DB>
DATABASE_IDENTITY_EXPECTED=moovex-platform-v7
DATABASE_IDENTITY_ENV=testing
SESSION_SECRET=<secret>
```

### Preferred production — FUTURE ONLY

```env
NODE_ENV=production
DEPLOYMENT_ENV=production
PLATFORM_DEPLOYMENT_CODE=moovex-platform-production
DATABASE_URL=<production DB>
DATABASE_IDENTITY_EXPECTED=moovex-platform-v7
DATABASE_IDENTITY_ENV=production
SESSION_SECRET=<secret>
```

Also typically used by existing gates: optional `GETPRO_PG_SSL`, optional `PORT`. Use repository `SESSION_SECRET` (do not invent alternate secret names).

`NODE_ENV=production` (or `test` locally). Never `NODE_ENV=blessboard`.
