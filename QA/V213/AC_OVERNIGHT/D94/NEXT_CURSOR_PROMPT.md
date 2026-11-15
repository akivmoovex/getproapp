# Next stage

Do not start from this file unless a later message sets the approvals below.

Required before any new product behavior: an explicit decision for the specific D21 or D29 item. Required before G2: both write flags `1`, a run id, testing identity, and a local disposable URL matching `^getpro_v13_(ci|bb_qa|int|e2e)_[a-z0-9]{6,32}$`, plus a separate migration approval if a migration is needed. Required before G3: the browser flag `1` and the same database checks. Required before a GitHub Stage A run: approval to apply the V13-only push trigger. Do not edit `main`. Do not send OTP. Do not deploy.

The quote fix and the eight tests are uncommitted. Commit only if a later message asks.
