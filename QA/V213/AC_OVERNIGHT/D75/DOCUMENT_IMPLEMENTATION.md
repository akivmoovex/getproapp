# Document implementation

A clinical attachment with no body is rejected before a query. No scan is merged into a patient record, and no checksum column was added.

A document read, draft update, and finalization stay in the document’s facility. A caller who names another facility receives `not_found` and does not receive the body. The draft and final updates now include that facility id.
