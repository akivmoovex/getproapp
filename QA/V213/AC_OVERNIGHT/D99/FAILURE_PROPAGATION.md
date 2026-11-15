# Failure propagation

A temporary test outside the repository asserted `1 === 2`. `node --test` exited 1. Log: `/tmp/d99-fail.log`. The same runner is what Stage A calls, so a failing assertion fails that job when GitHub runs it.

G1 passed 420, failed 0, and skipped 0. Finished `2026-11-15T03:54:15+0200`. Log: `/tmp/d99-g1.log`. Nothing in that run was skipped.

GitHub never reached a test command. Runs `43654736449` and `43654737245` completed with conclusion `failure`, event `push`, SHA `c2cd146b01c6a9cfd92db65c2862320892c0888c`, and zero jobs. Failure propagation on GitHub is not observed.
