# Batch 08C — Member Profile

**Date:** 2026-07-18
**Scope:** Member `/member/profile` presentation only. **Announcements not started.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 27), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_08A_MEMBER_SHELL.md`](./BATCH_08A_MEMBER_SHELL.md), [`BATCH_08B_MEMBER_DASHBOARD.md`](./BATCH_08B_MEMBER_DASHBOARD.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Profile | `15-member-profile-desktop` | `a323f678460c4d62bfe1a8de462f58e1` |
| Mobile Profile | `15-member-profile-mobile` | `55e21b658b57471db74eccd77e386079` |

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/member/profile.ejs` | Profile header, read-only vs editable groups, form layout, status badges |
| `public/blessboard/v5/member-portal.css` | Profile chrome (`?v=11`) |
| `views/blessboard/v5/partials/member-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-member-portal.test.js` | Profile GUI / unsupported-field assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Profile structure / a11y assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 27 note (Batch 08C) |
| `docs/gui/BATCH_08C_MEMBER_PROFILE.md` | This document |

**Unchanged:** `memberPortalRoutes.js` GET/POST handlers, CSRF validation, `getMemberPortalProfile` / `updateMemberPortalProfile`, field names, validation messages, auth gates, sessions.

## 3. Fields used (existing V5 only)

| Field | Surface | Editable |
|-------|---------|----------|
| `preferredName` | Form `name="preferredName"` | Yes |
| `emailDisplay` | Form `name="emailDisplay"` | Yes |
| `phone` → `phoneDisplay` / `phoneNormalized` | Form `name="phone"` | Yes |
| `firstName` + `lastName` | Legal Name (read-only display) | No |
| `emailNormalized` | Sign-in email (read-only display) | No |
| `membershipStatus` | Badge + Personal Information (read-only) | No |
| `isPrimaryBranch` | Optional “Primary branch” chip | No |

Form: `POST /member/profile`, hidden `_csrf`, same maxlength / autocomplete / aria-invalid / error summary behavior.

## 4. Unsupported Stitch content omitted

- Avatar upload / photo change
- Password change
- Notification preferences / Account Settings deep links
- Profile completion % / “Skills & Bio”
- Date of birth, residential address
- Ministry interests on profile (use `/member/ministries`)
- Emergency contact / medical notes
- Member Digital ID / QR check-in
- Recent member activity table
- Fabricated “Member since …” dates when not in profile model

## 5. Backend confirmation

| Concern | Status |
|---------|--------|
| Route method / action | Unchanged `GET`/`POST /member/profile` |
| Editable payload | Still only `preferredName`, `emailDisplay`, `phone` |
| Immutable rejection | Service still rejects `status`, `membershipStatus`, `firstName`, `lastName`, `email`, etc. |
| CSRF | Still required on POST via `validateCsrf` |
| Authorization | Still `requireMember` + active membership on tenant host |
| Privacy | No member/church/branch/user UUIDs in HTML (existing test) |

## 6. Responsive status

| Width | Behavior |
|-------|----------|
| ≤699px | Stacked header (avatar above identity); full-width Save/Cancel; single-column form |
| ≥700px | 2-col read-only kv + 2-col form grid |
| ≥900px | Header row (avatar + identity); 2-col panels (read-only \| editable) |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:member-portal` | **16/16 pass** (route/render, update/validation, CSRF, auth, UUID privacy) |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **34/34 pass** |
| `npx stylelint public/blessboard/v5/member-portal.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 8. Suggested commit message

```
Polish member profile to Stitch layout with clear read-only fields.
```
