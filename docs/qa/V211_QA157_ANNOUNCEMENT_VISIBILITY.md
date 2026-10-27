# V211-BB-QA157 Announcement Visibility

## Contract

HQ announcement management uses:

- `GET /hq/announcements`
- `GET /hq/announcements/new`
- `POST /hq/announcements`
- public church listing: `/c/:organizationKey/announcements`
- public detail: `/c/:organizationKey/announcements/:id`

Publication is explicit. The service also applies audience, branch scope,
`starts_at`, and `ends_at` filters. Scheduled items become visible only when
their start time is reached.

## Controlled execution

Using the authorized QA75 HQ session:

- admin form GET: `200`
- published/public announcement create: `303`
- draft announcement create: `303`
- future scheduled announcement create: `303`
- public listing GET: `200`
- published/public item rendered: yes
- draft item rendered publicly: no
- future scheduled item rendered publicly: no
- anonymous admin mutation: `401`

This reproduces the reported behavior as an expected lifecycle distinction:
an item present in the administration dashboard is not necessarily public. The
controlled published/public/in-scope item was visible, so no public-rendering
or publishing defect was confirmed.

Members-only, HQ/branch-specific comparison, other-branch denial, and detail
route assertions were not executed in this run. No product source, reset,
migration, protected database mutation, commit, push, or deployment occurred.
