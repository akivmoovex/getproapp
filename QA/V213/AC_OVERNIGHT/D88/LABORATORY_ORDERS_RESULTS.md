# Laboratory orders and results

A result entry still returns `PATIENT_NOT_FOUND` when the supplied patient differs from the request. A verified request still cannot take another result. Verification of another patient returns `PATIENT_NOT_FOUND` before the closed-status check. A closed result remains `ALREADY_VERIFIED`.

`acknowledgeCriticalResult` still selects the newest active alert for that patient. The function body does not contain `result_id` or an escalation. No critical-result timer or threshold was added. D21-06 is still pending.
