# V13 G91 fixture stabilization

The disposable database stayed `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`. No database was reset. No migration was applied.

Changes that make reruns deterministic:

- Clinic registration keys, emails, and phones include a timestamp so a new process does not collide with the previous run.
- Member activation and staff invitation use a new email for each run.
- BlessBoard theme tests provision church-wide public pages and a synthetic office email so the existing publish check can succeed.
- Password recovery cancels the run-owned pending challenge before the next send.
- The OTP IP hourly cap is 1000 only when `NODE_ENV` is `test`. Production stays at 20. The cap was reached because 20 challenges from `127.0.0.1` already existed in the hour.

Existing churches and clinics that this run did not create were not updated.
