# ActiveClinic Stitch — P27

**Audited:** 2026-08-04 (second inspection after P26)
**Exact phase label:** `P27`
**Module:** Juflona Patient Portal (auth, dashboard, bookings, profile)
**Stitch stability:** STITCH_IN_PROGRESS
**Screen count (final inspection):** 30
**Screen count (initial inspection):** 0
**Desktop / Mobile:** see list

**Stitch design project:** `projects/17813606734422395399`

## P27 completion test

| Condition | Result |
|-----------|--------|
| Stitch reports P27 complete | **No explicit completion** |
| Coherent final screen list | Emerging (patient portal) |
| Names consistently use P27 | Yes for current set |
| Desktop/mobile pairs mappable | Partial — still growing |
| Two inspections same set | **FAIL** — 0 → 30 screens |
| No P28 mixed in | True |

**Classification:** `STITCH_IN_PROGRESS` — **do not implement**.

## Visible screens (second inspection)

| Exact Stitch name | Screen ID | Form | WxH |
|-------------------|-----------|------|-----|
| P27 - Juflona Patient - Account Security - Desktop | `bb852d4218b9470981d9944eff62b1b4` | DESKTOP | 2560x2626 |
| P27 - Juflona Patient - Booking Detail - Desktop | `e506a5ea31c54b0abd9d7bba96c83ed8` | DESKTOP | 2560x2370 |
| P27 - Juflona Patient - Booking Filters - Mobile | `b3521756764f4a978c9244a2f5c3ae9e` | MOBILE | 780x1768 |
| P27 - Juflona Patient - Dashboard - Desktop | `1bb70f70b2d442bda9ec2bcfe6c9cd08` | DESKTOP | 2560x2048 |
| P27 - Juflona Patient - Dashboard - Mobile | `e4c2703d85764c2cbf2f91ab890d27e3` | MOBILE | 780x1784 |
| P27 - Juflona Patient - Dashboard Empty - Mobile | `0ec2c722bd80493ea69102f61b9b36e3` | MOBILE | 780x1768 |
| P27 - Juflona Patient - Dashboard Multiple Bookings - Desktop | `d499e36b667047e1998d38d66be6bbe2` | DESKTOP | 2560x2048 |
| P27 - Juflona Patient - Forgot Password - Desktop | `215624995dc145f7ad5f6adb14fd4ae6` | DESKTOP | 2560x2048 |
| P27 - Juflona Patient - Forgot Password - Mobile | `9ff0dd371e8e49d38b82288c77699671` | MOBILE | 780x1768 |
| P27 - Juflona Patient - Link Guest Booking - Mobile | `1d86eebeee5645c784e68b3b6315d06b` | MOBILE | 780x1768 |
| P27 - Juflona Patient - Login - Desktop | `4bc683c012fc465681d21655ac3d1d01` | DESKTOP | 2560x2048 |
| P27 - Juflona Patient - Login - Mobile | `7c24084776e64719be06423d42263e61` | MOBILE | 780x1920 |
| P27 - Juflona Patient - Login States - Mobile | `795b6f3cce584467bdc369bd89f67419` | MOBILE | 780x2804 |
| P27 - Juflona Patient - Mobile Navigation Pattern - Mobile | `e5078ea281eb4f29a284cf461b1c9b85` | MOBILE | 780x1896 |
| P27 - Juflona Patient - My Bookings - Mobile | `b86ad20f46574f5cba98f3aa4909b597` | MOBILE | 780x2274 |
| P27 - Juflona Patient - Notifications - Mobile | `1938bff7a7d54fa5a7d856457864d84d` | MOBILE | 780x1980 |
| P27 - Juflona Patient - Password Updated - Mobile | `cc39b8bf074e408682da114b26ed8897` | MOBILE | 780x1768 |
| P27 - Juflona Patient - Patient Data Boundaries - Desktop | `8405633077d0486f9622badff41899c9` | DESKTOP | 2560x2048 |
| P27 - Juflona Patient - Portal Component Patterns - Desktop | `5eceb58beaad489ba03f6750dee3896d` | DESKTOP | 2560x3534 |
| P27 - Juflona Patient - Portal Offline State - Mobile | `210ee3ac1bbe43588ed84d2e663c6604` | MOBILE | 780x1768 |
| P27 - Juflona Patient - Profile - Desktop | `34350dec0e124a538024436ec728e2be` | DESKTOP | 2560x2048 |
| P27 - Juflona Patient - Recovery Verification - Mobile | `3e22604b90844b499b98bed2dba8f81c` | MOBILE | 780x1768 |
| P27 - Juflona Patient - Register - Desktop | `cc7711d9ca2947bba30e8bdde0c473de` | DESKTOP | 2560x2580 |
| P27 - Juflona Patient - Register - Mobile | `588d1139d7b548c5856e9e34ce736bf9` | MOBILE | 780x2036 |
| P27 - Juflona Patient - Registration States - Mobile | `bc0fd174f14d4a3a8e78a57aad1564ee` | MOBILE | 780x7280 |
| P27 - Juflona Patient - Set New Password - Desktop | `e1b3f826511f408e85c401d3a455f26d` | DESKTOP | 2560x2048 |
| P27 - Juflona Patient - Set New Password - Mobile | `fb2dab64c9ed41f483ae83d4a7f20fe3` | MOBILE | 780x1768 |
| P27 - Juflona Patient - Verification Success - Mobile | `aebd18aad45b40ad90ebe164b87b282e` | MOBILE | 780x1768 |
| P27 - Juflona Patient - Verify Phone - Desktop | `4cb2cd96dd3846dcbcd3504e45b90f47` | DESKTOP | 2560x2048 |
| P27 - Juflona Patient - Verify Phone - Mobile | `fc27f3a94086412bbb546e19248ffc5d` | MOBILE | 780x1768 |

## Next safe prompt

When Stitch marks P27 complete and a fresh `list_screens` count is stable across two inspections, implement Juflona Patient Portal (P27) using screens listed above: patient login/register, dashboard, my bookings, profile, password recovery, and notification patterns — without claiming SMS delivery.
