# BlessBoard V2.07 announcement ownership

BlessBoard announcement authoring and consumption are canonical in system A:

- `/hq/announcements`
- `/hq/announcements/b/:branchKey`
- `/branch-admin/announcements`
- `blessboard.announcements`

The shared platform announcement studio (`/hq/announcement-studio`,
`/branch-admin/announcement-studio`, and `platform.tenant_announcements`) is
retained for compatibility and for other products, including ActiveClinic. It
must not be linked from BlessBoard user-facing navigation or used by BlessBoard
announcement workflows.

No migration or data operation is implied by this ownership decision.
