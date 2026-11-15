# AC-05 live denial evidence

No authenticated denial was produced.

The prepared test is `AC-05 authenticated user without platform administrator is denied test database management`. It targets `/admin/settings/test-database` and calls `hold(testInfo, "AC-05")` first. Because the browser is not authorized, that throw is the whole result. It is not an HTTP 403 from a signed-in lower-privilege user.

A missing session that redirects to `/login` would not count as this denial either. No such response was captured.
