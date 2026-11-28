# V2134 G331 hosted smoke results

HOSTED_DB_WRITES=NO  
HOSTED_BACKUP_VERIFIED=NO  
AUTO_DEPLOYMENT_STATUS=ACTIVE  

## After the booking push

Push `d5c5369d22fd` to `e1cafcea90871da89547c0937208297416cb7b53` on `origin/V13`.

Both hosts, read at 10:20 local time on 28 November 2026:

| Field | BlessBoard and ActiveClinic |
| --- | --- |
| HTTP | 200 |
| gitSha | `e1cafcea9087` |
| environment | `testing` |
| deploymentCode | `moovex-platform-testing` |
| schemaCompatible | true |
| ok | true |

Branch label remained `V11` from `GETPRO_GIT_BRANCH`. That label is not the checkout.

## Anonymous reads on that SHA

| Request | Result |
| --- | --- |
| `GET https://activeclinic.pronline.org/` | 200 |
| `GET https://activeclinic.pronline.org/clinics/julflona-clinic` | 200 |
| `GET https://blessboard.pronline.org/` | 200 |
| `GET https://activeclinic.pronline.org/clinics/julflona-clinic/book` | 403, `Online booking is not currently offered`, no Continue button |
| `GET https://activeclinic.pronline.org/clinics/activeclinic-demo/book` | 403, same sentence, no Continue button |
| `GET https://activeclinic.pronline.org/clinics/g331-unknown-clinic/book` | 404, no wizard |

No booking form was submitted. No appointment was created. No password, OTP, or payment was sent.

A later documentation push can advance the SHA again. Re-read `/healthz` before a test session and require `environment=testing` and `deploymentCode=moovex-platform-testing`. If booking pages show a wizard, stop and do not POST.
