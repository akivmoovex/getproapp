# Unified Messaging and Member Notifications — Implementation Report

## Exact Stitch screens implemented

| Screen | ID | Surface |
| --- | --- | --- |
| `61-hq-broadcast-center-desktop-v2` | `9317417f09104324ad86821c48cd4e06` | HQ Broadcast Center (responsive) |
| `61-hq-broadcast-center-mobile-v2` | `571f963fb85c488585b8550f7d0109b5` | HQ Broadcast Center (responsive) |
| `25-member-notifications-desktop` | `00d91c32a9d3411587620d50d4f8e971` | Member inbox + preferences (responsive) |
| `25-member-notifications-mobile` | `35992e75ec864305ae5d925d60967da8` | Member inbox (responsive) |

Stitch mock open/click/engagement metrics were **not** implemented (product rule: real values only).

## Existing architecture reused

- BlessBoard V5 HQ shell + member portal shell (Hanken Grotesk / Sacred Modernity)
- CSRF, tenant authz, active-member gate
- `blessBoardJobsGate` / `BLESSBOARD_JOBS_ENABLED` for scheduled send worker
- Existing branches, members, ministry memberships, event registrations for audience resolution
- Announcements module left intact (separate content feed; not duplicated)

## Routes added

### HQ

- `GET /hq/broadcasts`
- `GET /hq/broadcasts/new`
- `POST /hq/broadcasts/draft`
- `POST /hq/broadcasts/send`
- `GET /hq/broadcasts/:broadcastId`
- `POST /hq/broadcasts/:broadcastId/send`
- `POST /hq/broadcasts/:broadcastId/cancel`
- `POST /hq/broadcasts/estimate-audience`

### Member

- `GET /member/notifications`
- `GET /member/notifications/:notificationId`
- `POST /member/notifications/:notificationId/read`
- `POST /member/notifications/:notificationId/unread`
- `POST /member/notifications/read-all`
- `POST /member/notifications/:notificationId/archive`
- `GET /member/notification-preferences`
- `POST /member/notification-preferences`

## Schema changes

Migration `db/migrations/blessboard/045_unified_messaging_notifications.sql`:

- `blessboard.messages`
- `blessboard.message_audiences`
- `blessboard.member_notifications` (unique per message/member)
- `blessboard.message_delivery_attempts`
- `blessboard.member_notification_preferences`

## Message types supported

Manual HQ composer: `announcement`, `leadership_message`, `ministry_announcement`, `event_reminder`, `service_update`, `administrative_notice`, `direct_message`

Reserved (not manually creatable): `system_notice`, `giving_receipt`

## Audience types supported

- `all_active_members`
- `branches`
- `ministries`
- `roles`
- `members`
- `event_attendees` (registered attendees only)

## Delivery channels genuinely available

| Channel | Status |
| --- | --- |
| In-app | Available (canonical letterbox) |
| Email | Not configured for member messaging (`unavailable`) |
| SMS | Not available yet (`unavailable`) |
| Push | Not available yet (`unavailable`) |

Provider delivery is never claimed without configuration.

## Preference behavior

- Category × channel matrix, org/church scoped
- Presets: All Updates, Important Only, In-App Only, Custom
- In-app remains enabled (canonical)
- SMS/Push/Email cannot be enabled when channel or contact eligibility is missing
- Contact details shown masked; profile edits link to `/member/profile`

## Giving-receipt integration

- No per-member giving receipt table exists in V5
- HQ cannot manually create `giving_receipt` messages
- Inbox supports the type only when a real source record creates a notification later

## Security and isolation

- Church-scoped messages and notifications
- Cross-org audience member IDs rejected
- Cross-member notification IDs return 404
- CSRF on all POSTs
- HTML rejected in composer fields; safe markdown-lite render on read
- CTA URLs restricted to https or same-site paths
- Duplicate send blocked via status + idempotency key

## Tests

Focused:

```text
node --test --test-concurrency=1 \
  tests/hq-broadcast-center-v2.test.js \
  tests/member-notifications.test.js \
  tests/member-notification-preferences.test.js
```

Result: **25/25 pass**

Regression run (related):

- `blessboard-announcements`: **18/18 pass**
- `blessboard-member-portal`: **16/16 pass** (nav assertion updated for Notifications)
- `blessboard-hq-shell`: **9/9 pass** (nav assertion updated for Broadcasts)
- Focused messaging suites: **25/25 pass**
- `blessboard-v5-csrf-action-audit` / `blessboard-v5-route-link-audit`: pre-existing Phase3 website failures unrelated to messaging

## Deferred

- Real Email/SMS/Push provider adapters
- Member-to-member chat / threads / reactions
- Open/click tracking
- AI Sacred Focus filtering from Stitch mock
- Per-member giving receipt generation workflow
- Branch Broadcast Center
- Marketing automation

## Manual verification

1. HQ: open `/hq/broadcasts` on desktop and mobile widths; confirm summary cards and list (no open/click rates).
2. Create draft → send to all active members → confirm member sees inbox item.
3. Send branch-scoped and direct message; confirm isolation.
4. Member: mark read/unread/archive; update preferences; confirm unavailable channels labeled.
5. Attempt send with empty audience; confirm clear error.
6. With jobs off, confirm schedule UI note; with jobs on, run `scripts/run-blessboard-scheduled-messages.js`.
