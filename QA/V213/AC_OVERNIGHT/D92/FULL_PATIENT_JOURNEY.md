# Full patient journey

Journeys A through E were not executed. The prepared spec contains seven tests, and each one calls `hold()` before `page.goto` or a form fill. `hold()` throws `NOT_RUN` while the browser flag, both write flags, or a guarded `E2E_DATABASE_URL` is missing.

Staff patient creation, duplicate detection, check-in, encounter, queue, triage, consultation, laboratory, dispensing, invoice, and consent screens were not clicked. Slot capacity and a clinical handoff are not implemented. Secure document import is not implemented. Those three are `FEATURE_NOT_IMPLEMENTED` and were not treated as passes.
