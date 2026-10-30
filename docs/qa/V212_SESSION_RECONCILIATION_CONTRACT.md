# V212 Session Reconciliation Contract

Sessions are shared platform authentication records linked to an identity and, where present, active product/tenant context. BlessBoard and ActiveClinic do not have independent reset-safe session stores. Session rows, refresh tokens, password-reset tokens, and verification tokens are protected shared records.

A future reset must: stop new affected logins; enumerate sessions by identity and tenant context; invalidate affected sessions/tokens through the supported auth service; verify zero affected live sessions; preserve platform administrators; and require reauthentication after restore. No sessions were invalidated in Phase 3F.

Restoration evidence: restored administrator authentication succeeded against the separate disposable restore database. Production and existing databases were not targeted.
