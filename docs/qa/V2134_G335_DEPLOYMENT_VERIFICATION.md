# V2134 G335 deployment verification

The first push deployed `0b230859cf35e79f2b4c2c91100fcf3b7126bcfb`. Both hosts then reported that SHA on `/healthz`, with `ok=true`, `environment=testing`, `deploymentCode=moovex-platform-testing`, and `schemaCompatible=true`.

`GET /` returned 200 on ActiveClinic and BlessBoard. `GET /clinics/julflona-clinic/book` and `GET /clinics/activeclinic-demo/book` returned 403 with the title "Booking not available". No hosted record was created. Live OTP was not turned on. Migration 048 was not applied.

Rollback, if either host becomes unhealthy: do not reset the database. The previous testing SHA is `9d87d73a7957b24b4da79dfbd9160649c0116dea`. Restoring it requires an owner decision. This gate will not force-push.
