# Security tests

| Test | Result |
|---|---|
| Booking key for another organization | No booking |
| Payment retry with a different amount | `duplicate_submission`, stored amount 2500, no insert |
| Reversal in another facility | `not_found`, no reversal insert |
| Second reversal | `already_reversed`, no second insert |
| Attachment with no body | `invalid_input` before a query |
| Document in another facility | `not_found`, body absent |
| Draft update in another facility | `not_found`, no update |

These use a fake database. They are not a stored security pass.
