# PHASE5_010 — Screen Completion Plan

**Date:** 2026-07-25  
**Source audit:** `docs/phase5/PHASE5_009_FINAL_SCREEN_COMPLETENESS_AUDIT.md`  
**Constraint:** No backend redesign; honest delivery (no false email/SMS claims); preserve approval/provision/request/reject rules.

## Completion table

| Screen | Current route | Missing parity items | Files to change | Backend change needed | Priority |
| --- | --- | --- | --- | --- | --- |
| 1. Church Registrations | `GET /admin/registration-applications` | New/`needs_review` filter clarity; card/table density; duplicate-warning visibility markers; responsive filter wrap | `registration-applications.ejs`, `platform-admin.css`, `registrationQueuePresentation.js` | NO | P0 |
| 2. Empty State | same | Already IMPLEMENTED — verify markers only | — | NO | P2 |
| 3. Mobile queue | same | Already IMPLEMENTED — responsive CSS polish | `platform-admin.css` | NO | P1 |
| 4. Review hub | `GET …/:id` | Decision density; hide dup controls when no risk; long-text wrap | `registration-application-detail.ejs`, CSS | NO | P0 |
| 5. Review Mobile | same | Sticky actions / stack | CSS | NO | P1 |
| 6. Dup Warning | same | Already IMPLEMENTED — keep visible only when matches | hub partials | NO | P2 |
| 7. Dup Warning Mobile | same | Already IMPLEMENTED | CSS | NO | P2 |
| 8. Approve Confirmation | `GET …/:id/approve` | Org key preview + public URL preview; reviewer note; quieter org-key override; consequences; processing disable | `registration-application-approve-confirm.ejs`, CSS | NO (optional note field already stored if posted) | P0 |
| 9. Approve Confirm Mobile | same | Action stack / overflow | CSS | NO | P1 |
| 10. Approval Processing | client overlay on POST | Screen-level card (not spinner-only); honest indeterminate steps; a11y live region; no success-before-commit; refresh-safe notice | approve-confirm.ejs + CSS + JS | NO | P0 |
| 11. Church Approved | org detail success panel | Hero layout; org key; `/c/:key` public URL; Open public website; honest invite (no welcome-email claim); miniwebsite warning; next steps | `pa-registration-approved-success.ejs`, `organization-detail.ejs`, CSS | NO | P0 |
| 12. Church Approved Mobile | same | Action stack | CSS | NO | P1 |
| 13. Request Information | `GET …/:id/request-information` | Channel UI with unavailable SMS; “Request recorded. External delivery is not yet connected.” | request-information.ejs, CSS | NO | P0 |
| 14. Request Info Mobile | same | Form stack | CSS | NO | P1 |
| 15. Information Requested | `GET …/:id/information-requested` | Success hero; follow-up state; return-to-review + queue; no false sent | information-requested.ejs, CSS | NO | P0 |
| 16. Needs Information | hub panel | Strong banner; outstanding summary; audit snippet; gated approve; honest no-reminder | `pa-registration-needs-information.ejs`, CSS | NO | P0 |
| 17. Needs Info Mobile | same | Action stack | CSS | NO | P1 |
| 18. Reject Confirmation | `GET …/:id/reject` | Already IMPLEMENTED — destructive polish only | reject.ejs, CSS | NO | P2 |
| 19. Reject Mobile | same | Already IMPLEMENTED | CSS | NO | P2 |
| 20. Rejected result | `GET …/:id/rejected` | Result hero; audit timeline; reopen gate clarity | rejected.ejs, CSS | NO | P0 |

## Explicit mapping (all 20)

| # | Stitch | Implementation surface | Target verdict |
|---|--------|------------------------|----------------|
| 1–3 | Queue / Empty / Mobile | `registration-applications.ejs` | CLOSE→MATCHED where practical |
| 4–7 | Review / Mobile / Dup / Dup Mobile | `registration-application-detail.ejs` + dup banner | CLOSE→MATCHED |
| 8–9 | Approve confirm D/M | `registration-application-approve-confirm.ejs` | MATCHED (honest copy) |
| 10 | Processing | Full-screen processing panel on confirm | MATCHED (honest indeterminate) |
| 11–12 | Approved D/M | `pa-registration-approved-success.ejs` | MATCHED (honest invite) |
| 13–14 | Request info D/M | `registration-application-request-information.ejs` | MATCHED (honest delivery) |
| 15 | Information requested | `registration-application-information-requested.ejs` | MATCHED |
| 16–17 | Needs info D/M | `pa-registration-needs-information.ejs` | MATCHED |
| 18–19 | Reject D/M | `registration-application-reject.ejs` | MATCHED |
| 20 | Rejected | `registration-application-rejected.ejs` | MATCHED |

## Documented honest differences (not PARTIAL gaps)

- Stitch “Welcome email sent” / “Resend Welcome Email” → copy-once invite + “External delivery is not yet connected.”
- Stitch processing step auto-complete → indeterminate until server POST completes.
- No KPI strip / Manual Registration CTA (no backed aggregates).

## Backend change needed

**None** for completion. Optional reviewer note on approve POST only if field already accepted; otherwise UI-only note stays local/display.
