# G224 bug and test matrix

| ID | Defect | Fix | Tests |
| --- | --- | --- | --- |
| G224-LAB-ENTRY | Result entry was not offered after receipt | Request detail links Enter result while the stored status is still resultable and no result exists | Unit filter test; HTTP journey; browser journey |
| G224-LAB-FILTER | Received orders were absent from the processing tab | Tabs now include collected, received, and resulted | `laboratoryQueueTabs` unit test; HTTP queue assertions |
| G224-LAB-COUNT | Dashboard omitted persisted statuses, and verify did not move the request to `verified` | Dashboard shows the stored counts. Verify updates the request only when its status is `resulted` | HTTP dashboard count; SQL status after verify |
| G224-RAD-FILTER | Completed radiology work had no tab or counter | Completed tab and dashboard card use the existing status | `radiologyQueueTabs` unit test |
| G224-PRINT | A recorded laboratory result had no print action | Authorized request page includes Print result | Browser button assertion |
| G224-AUTH | Reception can open the laboratory queue | No change. Reception remains denied | HTTP 403; browser request denial |
| G224-SELF | The person who entered a result can verify it | No change. Existing service denial stays | HTTP 403; browser failure text |
| G224-PATIENT | A result can be attached to the wrong patient | No change. Existing patient check stays | HTTP `PATIENT_NOT_FOUND` before the real entry |
| G224-READ | Clinician cannot see the recorded summary | Encounter orders join the result for the same patient | HTTP and browser `data-ac-lab-readback` |

The laboratory browser journey is Order, Collection, Receipt, Result entry, Verification, Clinician read-back. Patient id, status, and the second-staff verifier are read back from PostgreSQL. Mock community browser results are not counted as this evidence.

Vitals correction, portal activation, and website text publication stay on their existing tests. They were not reopened. OTP and slot capacity stay failed. Public booking stays disabled.
