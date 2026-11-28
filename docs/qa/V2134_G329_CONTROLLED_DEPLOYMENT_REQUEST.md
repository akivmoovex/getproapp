# V2134 G329 controlled deployment request

STATUS=HELD_LOCALLY  
COMMIT=NO  
PUSH=NO  
HOSTED_DEPLOYMENT=NOT_PERFORMED  
AUTO_DEPLOYMENT_STILL_ACTIVE=YES  
MAIN_UNCHANGED=YES  

## Request

Keep this patch on the local `V13` worktree until both of the following are true:

1. Hostinger automatic deployment for the testing app is off, and the running checkout is pinned to the SHA that is already live: `d5c5369d22fd825938fe1a9692dadee19bfd4a93`.
2. A separate owner approval names this local patch and authorizes one controlled deployment of it.

G328 showed that a push to `origin/V13` became the shared hbuild checkout and restarted both workers. Pushing this patch now would deploy it. That is why it stays uncommitted and unpushed.

## What the controlled deployment would contain

The local files listed in `docs/qa/V2134_G329_BOOKING_POLICY_PATCH.md`. They refuse new public booking admission while `GETPRO_AC_PUBLIC_BOOKING_ADMISSION` is unset. They leave staff `createAppointment`, existing appointment rows, my-booking lookup, and patient-portal management of existing bookings in place.

## What that approval still must leave alone

| Item | Hold |
| --- | --- |
| `GETPRO_AC_PUBLIC_BOOKING_ADMISSION` | Leave unset. Setting it to `enabled` would reopen public booking on a non-production deployment. This patch does not approve that |
| `public_booking_enabled` rows | Do not update them. A true clinic flag cannot bypass the platform contract, and this gate did not change any flag |
| Hosted database | No write, no migration, no snapshot from this worktree |
| `main` | Unchanged at `44eafec486a18aeef2777bbcc9683e43f68ebe0d` |
| Backup | G328 still records `BACKUP_EVIDENCE=NONE`. A restart or any hosted write still waits on that separate proof |
| Real email OTP | Unchanged and unsent |

## Approvals that remain separate

| ID | Decision | State after this local patch |
| --- | --- | --- |
| A | Testing snapshot and scratch restore | Still required before a restart or hosted write |
| B | Any hosted data change, including clinic booking flags or the 64 write cases | Not approved |
| C | Turn off automatic deployment and pin `d5c5369d22fd825938fe1a9692dadee19bfd4a93` | Required before any push |
| D | Local booking admission patch and local regression | Done in this worktree. This is not deployment approval |
| E | One real Resend message | Not approved |
| F | Controlled deployment of this local patch after C | The approval this request is waiting for |

Approving one row does not approve another.

NEXT_REQUIRED_OWNER_APPROVAL=Disable Hostinger automatic deployment for the testing app and pin hosted SHA `d5c5369d22fd825938fe1a9692dadee19bfd4a93`. Then explicitly authorize a controlled deployment of this local patch. Leave `GETPRO_AC_PUBLIC_BOOKING_ADMISSION` unset. Backup proof remains required before a restart or any hosted database write.
