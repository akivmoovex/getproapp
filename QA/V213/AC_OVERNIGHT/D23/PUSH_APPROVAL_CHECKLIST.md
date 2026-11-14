# Push approval checklist

Every item below is still open. This stage did not commit or push.

| Check | State |
|---|---|
| Commit approved by the repository owner | Required |
| Staging limited to the 122-path manifest | Required. `git add -A` is not acceptable |
| Decision on the 60 excluded product files | Required. The QA tests do not pass on a clean tree without them |
| `git diff --cached --stat` reviewed after a future `git add` of only those paths | Required |
| Push target is `origin` `V13`, not `main` | Required |
| Confirmation that `ci.yml` still ignores `V13` | Holds today |
| Confirmation that V13 workflow jobs remain `if: ${{ false }}` | Holds today |
| Database, browser, OTP provider, and deployment approvals | Still held. A push does not grant them |

Proposed commands, neither executed:

```
git add -- path-from-QA_COMMIT_MANIFEST.md
git commit -m "$(cat <<'EOF'
Record the V2.13 QA evidence and held regression tests.

The reports and tests stay on the QA branch. They do not release ActiveClinic, enable OTP, or open the database and browser gates.

EOF
)"
git push -u origin V13
```

`git status` after that future commit must still show the 60 product paths as unstaged. If they disappear from the unstaged list, the commit picked up product runtime and should not be pushed.
