# V2.13.1 G13 — clinical user experience

No browser was launched and no data was changed.

| Screen | Route | Visible next step in source | Prepared check |
| --- | --- | --- | --- |
| Reception | `/app/reception` walk-in | Service points, or an empty-facility notice | Existing `AC-REC-02`, not run |
| Nurse triage | `/app/clinical` | Start triage when the role has `activeclinic.triage.record` | Existing `AC-REC-03`, not run |
| Clinician workspace | `/app/clinical` | Start encounter, follow-up, consultation | New `G13` receptionist denial in `v13-ac-platform-qa.spec.js`, not run |
| Laboratory queue | `/app/diagnostics/laboratory/queue` | Status tabs and the request detail | Existing `G03`, not run |
| Pharmacy | `/app/pharmacy` | Queue and dispense when permitted | Existing `G04`, not run |
| Billing | `/app/billing` | Catalogue, invoice, and payment actions behind billing permissions | Existing billing denial, not run |
| Patient history | Encounter workspace | Notes, orders, and vitals for that encounter | Not run |
| Record retrieval | `/app/clinical/patients/:patientId/documents` | Document list, or access denied | Existing `G05`, not run |

The practitioner worklist title is `Practitioner worklist`. The new Playwright case expects a receptionist to receive 401 or 403 and not that title. It calls `hold()` before any request, and it was not executed.

Empty walk-in facilities already show `data-ac-walkin-empty="1"` instead of a required empty select. Validation errors on the prescription form redisplay the entered values. Permission failures use the existing 403 state pages.

```
UX_GAPS=No browser pass; pharmacy handoff is invisible when the form has no catalogue item; clinical file upload is not on the document screen
```
