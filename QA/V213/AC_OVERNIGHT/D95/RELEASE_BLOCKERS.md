# Release blockers

Release stays no. The blockers, in the order they have to clear, are:

1. Origin still has the unquoted workflow colon. The local quote fix is uncommitted. GitHub Stage A has not run.
2. Eighteen design decisions are unapproved. Missing clinical and operational rules cannot be built before the matching decision.
3. Database writes, migrations, and the browser are not approved. Flags are `0` and no disposable URL is set.
4. G2 executed 0 and G3 executed 0. Acceptance verified is 0. `SEC-01-02` stays blocked until a live denial exists.
5. The V13-only push trigger is not approved. Applying it is outside this stage.

`CI-001` is the only confirmed runtime defect. Merge, retention, restore, offline writes, and accessibility numbers are missing functionality, not defects.
