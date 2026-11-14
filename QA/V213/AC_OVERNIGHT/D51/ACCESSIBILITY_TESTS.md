# Accessibility tests

No browser was opened. Keyboard focus, contrast, and screen-reader announcements were not measured.

What the existing pages already do, from source only:

| Surface | Current behavior |
|---|---|
| Patient result list | A patient with no linked record sees “Link a patient record to view results.” |
| Unknown modality or id | The page is the existing not-found response. The service returns `invalid_input` before a query |
| Clinical document form | Validation returns a code such as `invalid_input` or `invalid_document_type`. An announcement of that code was not tested |
| Offline page | HTTP 503. It is not an editable form |

A browser pass is required before any of these can be called accessible. D29-18 has no approved target.
