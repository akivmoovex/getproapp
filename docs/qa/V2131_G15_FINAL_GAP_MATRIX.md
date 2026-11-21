# V2.13.1 G15 — remaining-work matrix

Status uses the G08 rule. `IMPLEMENTED_UNVERIFIED` means the source and a database-free test exist and the user workflow was not executed. Nothing in this table is `VERIFIED`.

| ID | Area | Status | Severity | Depends on | Source | Test |
| --- | --- | --- | --- | --- | --- | --- |
| AC-REG-01 | Clinical | IMPLEMENTED_UNVERIFIED | High | Isolated HTTP | Registration identity resolver | Safe PASS, HTTP NOT_RUN |
| AC-AUTH-04 | Clinical | IMPLEMENTED_UNVERIFIED | High | Isolated HTTP | Password recovery service | Safe PASS, HTTP NOT_RUN |
| AC-WEB-08 | Clinical | IMPLEMENTED_UNVERIFIED | Medium | Isolated HTTP | Website CMS | Safe PASS, HTTP NOT_RUN |
| AC-WEB-09 | Clinical | IMPLEMENTED_UNVERIFIED | Medium | Browser | Theme service | Safe PASS, browser NOT_RUN |
| AC-REC-02 | Handoff | IMPLEMENTED_UNVERIFIED | High | Browser | Reception service | Safe PASS, browser NOT_RUN |
| AC-REC-03 | Handoff | IMPLEMENTED_UNVERIFIED | High | Browser | Clinical service | Safe PASS, browser NOT_RUN |
| AC-PUB-01 | Clinical | IMPLEMENTED_UNVERIFIED | High | Disabled flag stays false | Public booking routes | Safe PASS, HTTP NOT_RUN |
| AC-PUB-ENABLED | Clinical | DEFERRED | High | Product decision | — | — |
| AC-IDENTITY | Clinical | IMPLEMENTED_UNVERIFIED | High | HTTP | Patient service | Safe PASS |
| AC-VISITS | Clinical | IMPLEMENTED_UNVERIFIED | High | HTTP | `startEncounter` | Safe PASS |
| AC-CONSULT | Clinical | IMPLEMENTED_UNVERIFIED | High | HTTP | Consultation notes | Safe PASS |
| AC-LAB-ORDER | Handoff | IMPLEMENTED_UNVERIFIED | High | HTTP | Clinical order plus form | Safe PASS |
| AC-LAB-RESULT | Handoff | PARTIAL | High | Approved ranges | Diagnostics service | Safe PASS |
| AC-RX-ORDER | Handoff | PARTIAL | High | Catalogue id on the form | Clinical order | Safe PASS |
| AC-PAYMENT | Clinical | IMPLEMENTED_UNVERIFIED | High | No processor | Billing service | Safe PASS |
| AC-MIGRATION-BATCH | Data | BLOCKED | Medium | Apply 043 later | `043_record_migration_inventory.sql` | Safe PASS, DB NOT_RUN |
| AC-BINARY-STORAGE | Data | DEFERRED | Medium | Storage decision | Document service comment | — |
| AC-PAPER-DISPOSAL | Data | DEFERRED | High | Legal approval | Migration service | Safe PASS |
| BB-REG-07 | BlessBoard | IMPLEMENTED_UNVERIFIED | High | HTTP | Church registration | Safe PASS |
| BB-AUTH-04 | BlessBoard | IMPLEMENTED_UNVERIFIED | High | HTTP | OTP service | Safe PASS |
| BB-MEM-01 | BlessBoard | IMPLEMENTED_UNVERIFIED | High | HTTP | Member form | Safe PASS |
| BB-MEM-02 | BlessBoard | IMPLEMENTED_UNVERIFIED | High | HTTP | Member routes | Safe PASS |
| BB-WEB-08 | BlessBoard | PARTIAL | Medium | Fixture write | Theme service | Safe PASS |
| BB-WEB-09 | BlessBoard | IMPLEMENTED_UNVERIFIED | Medium | Browser | Sermon draft | Safe PASS |
| BB-WEB-10 | BlessBoard | IMPLEMENTED_UNVERIFIED | Medium | Browser | Event draft | Safe PASS |
| BB-ANN-01 | BlessBoard | IMPLEMENTED_UNVERIFIED | Medium | HTTP | Announcements | Safe PASS |
| BB-ANN-02 | BlessBoard | PARTIAL | Medium | Upload flag | Media switch | Safe PASS |
| SHARED-SECURITY | Security | IMPLEMENTED_UNVERIFIED | High | HTTP | Identity, CSRF, sessions, appointments | Safe PASS |
| SHARED-OPS | Operations | BLOCKED | High | Authorized demonstration | Offline route stays 503 | Not demonstrated |

## Separate scores

| Area | Score |
| --- | --- |
| Clinical functionality | Source present for the journey. No HTTP pass. |
| Department handoffs | Reception, triage, laboratory, pharmacy, and billing are separate permissions. Pharmacy queue handoff is partial. |
| BlessBoard functionality | Regression source remains. Public pages are unwritten. Uploads stay disabled. |
| Security | Tenant filters and CSRF/OTP gates remain. New migration service is not routed. |
| Data integrity | No silent merge, no silent signed-note edit, no invented vital type. |
| Database migrations | One file prepared, zero executed. |
| Browser verification | NOT_RUN |
| Operational readiness | NOT_DEMONSTRATED |
