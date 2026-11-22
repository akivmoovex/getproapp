# V13 G25 — safe regression results

Command: database URLs and write flags unset, `node --test` on `tests/v13/contract/*.test.js` and `tests/v13/unit/*.test.js`.

```
tests 467
pass 467
fail 0
skipped 0
```

No failure required a source repair. Version `2.13.1` is still `PRODUCT_VERSION_V8`. The sixteen regression fixes, CSRF checks, OTP production refusal, appointment `stale_version`, and `publicBookingEnabled: false` were still present when this suite ran.

HTTP and Playwright were not executed. Those results are `NOT_RUN`, not pass.

```
SAFE_TESTS_PASSED=467
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
```
