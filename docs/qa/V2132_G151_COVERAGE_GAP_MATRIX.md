# G151 coverage gap matrix

Gaps after the G165 browser additions. A page-load check is not counted as coverage.

| GAP | CLASS | WHY IT REMAINS |
| --- | --- | --- |
| D14C OTP challenge persistence | MIGRATION_BLOCKER | `platform.otp_challenges` is absent. Migration 048 was not authorized. The test still fails. |
| D16 platform OTP persistence | MIGRATION_BLOCKER | Same absent table. The second-worker test still fails. |
| D25 slot capacity | POLICY_BLOCKER | `evaluateSlotCapacity` returns `BLOCKED_APPROVAL_REQUIRED`. No capacity integer was added. |
| Public self-registration | DISABLED_BY_POLICY | Unknown registration is asserted to insert no patient. |
| Public booking | DISABLED_BY_POLICY | Booking page stays disabled. No coupon. |
| Binary media upload | DISABLED_BY_POLICY | BlessBoard attachment control says uploads are off. The file id stays empty. |
| Resend domain verification | EXTERNAL_SERVICE_BLOCKER | DNS records exist. No Resend account connection and no API key. |
| Live email delivery | EXTERNAL_SERVICE_BLOCKER | Not authorized. No message was sent. |
| Consultation note signing | P1_BROWSER_GAP | POST sign route exists. No v13 browser journey creates a note and signs it. |
| Stocked pharmacy dispense | P1_BROWSER_GAP | Dispense route exists. v13 proof is the cross-organization denial and the queue explanation. No stock batch was seeded. |
| Hosted QA | NOT_AUTHORIZED | pronline hosts were not deployed by this cycle. |

Patient number search, staff duplicate phone search, and member directory search were the actionable browser gaps closed in this cycle. The member directory is ordered by last name and shows 20 rows. A new member whose last name sorts after the first page is found by search, not by opening page 1.
