# V13 G92 ActiveClinic authentication and website

AC-REG-01 remains VERIFIED_E2E from the earlier browser and HTTP passes. It was not in the latest HTTP fail list.

AC-AUTH-04 remains VERIFIED_E2E. HTTP reset passes. The browser check opens the used link and shows that it is no longer valid. The earlier hanging POST was not put back.

AC-WEB-08 is VERIFIED_HTTP. The HTTP scenario creates a section, previews it, publishes it, and denies the other clinic. The browser scenario still does not show the new heading on the public page.

AC-WEB-09 is VERIFIED_HTTP only. A new clinic's HTTP theme preview shows mint. The browser scenario on `v13-d19-clinic-a` still renders `ac.default` after the theme API returns mint. It is not VERIFIED_E2E.
