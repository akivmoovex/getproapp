# Regression results

The focused YAML test passed 2 and failed 0. It shows the unquoted hold echo is invalid YAML, and the four V13 workflow files parse. The ActiveClinic and platform hold commands stay single-quoted. Neither file has a `push` trigger. The held jobs stay `if: ${{ false }}`.

G1 then passed 418, failed 0, and skipped 0. Finished `2026-11-15T03:50:36+0200`. Log: `/tmp/d96-g1.log`. That run includes the appointment, portal, BlessBoard, and platform-admin contract tests. No database was opened.
