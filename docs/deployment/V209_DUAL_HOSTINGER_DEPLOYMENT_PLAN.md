# V2.09 Dual Hostinger Deployment Plan

Status: preparation only; no Hostinger or database changes performed.

## Release identity

- Branch: `V9`
- SHA: `8d777dea8f900565f1ccb585dce55a120f890a22`
- GitHub `origin/V9`: matches local SHA.
- Hosted SHA, deployment history, and rollback artifact: not available.

## Deployment A: Neuniversity preservation

- Profile: `moovex-platform-v8-testing`
- Domains: `neuniversity.org`, `www.neuniversity.org`,
  `blessboard.neuniversity.org`, `activeclinic.neuniversity.org`
- Preserve current application, branch, SHA, database, startup settings, and
  DNS before any Pronline work.

## Deployment B: Pronline V9

- Profile: `moovex-platform-testing`
- Domains: `pronline.org`, `www.pronline.org`,
  `blessboard.pronline.org`, `activeclinic.pronline.org`,
  `getproapp.pronline.org`, `getpro.pronline.org`, `netraz.pronline.org`,
  `moovex.pronline.org`
- Expected SHA: `8d777dea8f900565f1ccb585dce55a120f890a22`
- Production startup contract: `node index.js` (`package.json`), Node `>=20`.
  Do not use `scripts/local/run-local-qa-server.js`.

Required sanitized environment values include `NODE_ENV`, the profile-specific
`PLATFORM_DEPLOYMENT_CODE`, local/private `DATABASE_URL`, `SESSION_SECRET`,
and any approved proxy/port settings. Secrets must be entered only in
Hostinger and never committed.

## Compatibility and risks

The V8 profile is defined in V9 and uses `neuniversity.org` domains, V8
cookie names, V8 media namespace, and canonical domain `neuniversity.org`.
The target profile uses `pronline.org` domains, separate testing cookie names,
testing media namespace, and canonical domain `pronline.org`. Both require the
testing environment and V7 identity, but hosted database identity and
migration state are unverified. Database sharing is therefore NOT approved.

Changing the profile can alter database selection, tenant hostname routing,
canonical redirects, session cookies, and product selection. Keep the
deployments independent unless Hostinger and database ownership evidence
proves safe sharing.

## Safe sequence

1. Export Deployment A settings, domain bindings, DNS targets, hosted SHA,
   startup file, Node version, database identity, and migration level.
2. Confirm the owner accepts both domain sets and preserve Deployment A.
3. Create Deployment B as a separate Hostinger application, deploy the exact
   SHA, set the target profile, and use `node index.js`.
4. Validate on a temporary Hostinger hostname before attaching Pronline
   domains: health, profile identity, database identity, canonical redirects,
   login/session behavior, and each product hostname.
5. Attach Pronline domains only after temporary-host validation.
6. Verify Neuniversity domains remain healthy throughout.

## Rollback

Restore Deployment A's recorded profile, SHA, startup file, Node version,
database settings, and domain bindings. Detach Pronline domains from the
failed Deployment B and restore their previous targets. Restart workers and
check health, canonical redirects, login, and all Neuniversity domains.
Rollback readiness is incomplete until the current hosted SHA/settings and
database compatibility are captured.

## Manual evidence required

Hostinger application IDs/roots, deployed branch/SHA/time, Node version,
startup file, effective sanitized environment, proxy headers, DNS ownership,
database identity/migrations, and a rollback artifact are unavailable to this
read-only session.
