# G228 laboratory QA

The complete laboratory journey is now covered by the G224/G228 HTTP and
browser tests: order, collection, persisted specimen, receipt, received queue,
result entry, persisted result/patient association, print-ready result,
same-actor verification denial, second-staff verification, request/result
status read-back, and clinician read-back.

The result service accepts `pending_collection`, `collected`, `received`, and
`processing` as resultable states. It does not invent reference ranges. Empty
components are valid; supplied component JSON is parsed and validated before
the service is called. The workflow does not automatically classify
hemoglobin, WBC, RBC, or platelets without an approved reference rule.

Negative coverage includes receptionist denial, wrong-clinic request denial,
wrong-patient association, invalid component input, and same-staff verification
denial. The HTTP journey reads patient ids, statuses, result summary, and
verifier identity from PostgreSQL. The browser journey exercises the real
forms. No migration was executed.
