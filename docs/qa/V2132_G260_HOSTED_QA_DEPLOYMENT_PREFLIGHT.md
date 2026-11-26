# V2132 G260 hosted QA deployment preflight

**Deployment not performed.**

| Item | Value |
| --- | --- |
| Intended V13 SHA | tip after G260 push (verify `git rev-parse origin/V13`) |
| Current hosted SHA | UNKNOWN — operator must record |
| Isolation | testing host only; not production |
| Database | hosted testing identity must match deployment profile; do not use production |
| Schema compatibility | OTP/Community tables may be absent on hosted unless separately approved |
| Backup | required before any hosted schema change |
| Env | no production secrets; Resend QA key only if authorized |
| Flags | public booking off; posting disabled; production OTP blocked |
| Rollback | redeploy previous known-good SHA |
| Post-deploy | AC/BB About 2.13.4; smoke login; lab/rad; website publish; no live OTP unless authorized |

Requires **separate owner authorization** before any hosted action.
