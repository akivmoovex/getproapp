# V13 G65 requirements and test baseline

Branch `V13`. Local and `origin/V13` were `a62a2be44529028ada2d2538802cb18c469a0ff2` at startup. `main` was `44eafec486a18aeef2777bbcc9683e43f68ebe0d`. The worktree was clean except the untracked superseded note `docs/qa/V2131_GAP_G08_FINAL_REPORT.md`.

The healthcare brief PDF and both office QA documents remain `SOURCE_UNAVAILABLE` in this worktree. They were not fetched.

Baseline before this pass: ActiveClinic 16 implemented-unverified, 7 partial, 6 blocked, 1 deferred. BlessBoard 13 implemented-unverified, 3 partial, 1 blocked, 0 deferred. Safe tests were 486 passed and 0 failed. HTTP and Playwright were `NOT_RUN`. Migrations 043 and 044 were not executed.

The 17 open rows are the 7 partial and 6 blocked ActiveClinic requirements plus the 3 partial and 1 blocked BlessBoard requirements. AC-29 stays `APPROVED_DEFERRED` and is not one of the 17.

| ID | Feature | Existing implementation | Required behavior | UI | Backend | Database | Security | Unit | Contract | HTTP | Browser | Policy | Blocker | Next | Class |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AC-06 | Longitudinal record | Encounter list | A continuity policy | Partial | Partial | Present for encounters | Tenant scoped | Yes | Yes | NOT_RUN | NOT_RUN | Continuity policy | None approved | Keep the list | NEEDS_POLICY |
| AC-11 | Diagnoses | Free text | Coded diagnoses | Partial | Partial | Text column | Clinician permission | Yes | Yes | NOT_RUN | NOT_RUN | Code set | Would invent codes | Keep free text | NEEDS_POLICY |
| AC-12 | Prescriptions | Manual form and order | Queue only with a real catalogue id | Notice added | Present | Order row | Manual entry | Yes | Yes | NOT_RUN | G67 NOT_RUN | Picker | No approved picker | Do not invent a drug | NEEDS_POLICY |
| AC-13 | Laboratory | Engine plus preview | Stored approved rules | Preview only | Engine | 044 absent | No default range | Yes | Yes | G66 NOT_RUN | G66 NOT_RUN | Thresholds | 044 not applied | Do not invent ranges | NEEDS_MIGRATION |
| AC-14 | Dispensing | Remainder and duplicate guard | Catalogue handoff | Pharmacy page | Present | Dispense tables | Dispense permission | Yes | Yes | NOT_RUN | NOT_RUN | Catalogue | Handoff is AC-12 | Do not invent a dose | NEEDS_POLICY |
| AC-17 | Documents | Text documents | Binary attachments | Text | Text | Text tables | Document permission | Yes | Yes | NOT_RUN | NOT_RUN | Binary store | D49 forbids the attachment path | Keep text | NEEDS_POLICY |
| AC-18 | Scanning | Unrouted service | Authorized import | None | Permission gate | 043 absent | `clinical_document.create` | Yes | Yes | NOT_RUN | NOT_RUN | Import | 043 not applied | Do not mount a write | NEEDS_MIGRATION |
| AC-19 | Retention and consent | Planners, paper retained | Legal periods and holds | None | Pure planners | Holds need 043 | No auto-delete | Yes | Yes | NOT_RUN | NOT_RUN | Periods and destruction | 043 and legal approval | Do not invent a period | NEEDS_MIGRATION |
| AC-25 | Export | Export function | Executed export | Present | Present | Job tables | Export permission | Yes | Yes | NOT_RUN | NOT_RUN | None new | Not executed | Isolated run | NEEDS_TEST_EXECUTION |
| AC-26 | Downtime | Offline 503 | Recovery drill | Offline page | No restore tool | None | Writes nothing | Yes | Yes | NOT_RUN | NOT_RUN | Recovery design | No restore tool | Do not build sync | NEEDS_TEST_EXECUTION |
| AC-27 | Accessibility | Unaudited | Audit | Unknown | Unknown | None | None | No audit | No audit | NOT_RUN | NOT_RUN | Audit method | Not audited | Isolated review | NEEDS_TEST_EXECUTION |
| AC-28 | Monitoring | No contract | A monitoring contract | None | None | None | None | No | No | NOT_RUN | NOT_RUN | Contract | No contract | Do not invent metrics | NEEDS_POLICY |
| AC-30 | Performance | No measurement | A performance run | None | None | None | None | No | No | NOT_RUN | NOT_RUN | Targets | Not measured | Isolated run | NEEDS_TEST_EXECUTION |
| BB-06 | Public website | Drafts and publish | Public pages | Present | Present | `public_pages` empty | Church scope | Yes | Yes | NOT_RUN | NOT_RUN | Fixture | Rows were not inserted | Authorized fixture | NEEDS_TEST_EXECUTION |
| BB-11 | Media | Validation, uploads off | Enabled uploads | Disabled state | Present | Media tables | Church ownership | Yes | Yes | NOT_RUN | NOT_RUN | Enablement | Flag stays off | Do not enable | NEEDS_POLICY |
| BB-13 | Prayer | Member-request category | A prayer module | Category only | None | None | Member scope | Partial | Partial | NOT_RUN | NOT_RUN | New module | Not approved | Do not add a module | APPROVED_DEFERRED |
| BB-16 | Reporting | Report routes | Executed export | Present | Present | Report tables | Church scope | Yes | Yes | NOT_RUN | NOT_RUN | None new | Not executed | Isolated run | NEEDS_TEST_EXECUTION |

AC-29 interoperability remains `APPROVED_DEFERRED`.
