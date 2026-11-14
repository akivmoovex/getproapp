# Triage implementation

Pain levels outside 0 to 10 are rejected before a query. The stored categories and the draft or completed status are unchanged. No vital-sign threshold was added.

An update uses the caller’s version when one is supplied. A row stored for another facility is not updated. A version miss returns `stale_version`.
