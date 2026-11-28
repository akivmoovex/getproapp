# V2134 G335 deployment verification

This file is written before the push. The hosted SHA at the start of G335 is `9d87d73a7957` on both https://activeclinic.pronline.org/healthz and https://blessboard.pronline.org/healthz. Both returned `ok=true`, `environment=testing`, and `deploymentCode=moovex-platform-testing`.

The push, if it succeeds, is one deployment of three commits. Live OTP stays off. Migration 048 is not in the push. Public booking is not enabled. The post-deploy health result is recorded in the final handoff after `/healthz` is read again.

Rollback, if either host becomes unhealthy: do not reset the database. The previous testing SHA is `9d87d73a7957b24b4da79dfbd9160649c0116dea`. Restoring it requires an owner decision. This gate will not force-push.
