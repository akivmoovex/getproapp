# V2.09 Theme HTTP Coverage Results

```text
BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
NEW_TESTS=5 in tests/v209-theme-http.test.js
TOTAL_FOCUSED_PASS=5
TOTAL_FOCUSED_FAIL=0
HTTP_LINE_COVERAGE=47.01%
HTTP_BRANCH_COVERAGE=100%
HTTP_FUNCTION_COVERAGE=50%
NINE_FILE_LINE_COVERAGE=34.63% (focused HTTP batch only; partial)
NINE_FILE_BRANCH_COVERAGE=78.87% (focused HTTP batch only; partial)
NINE_FILE_FUNCTION_COVERAGE=12.94% (focused HTTP batch only; partial)
SECURITY_TESTS=5 focused negative/authorization contract cases; prior isolated security batch 20/20
PRODUCT_DEFECTS=NONE_IDENTIFIED
APPLICATION_CODE_CHANGED=NO
PRODUCTION_MUTATION=NO
FINAL=V209_THEME_HTTP_COVERAGE_COMPLETE
```

Added only `tests/v209-theme-http.test.js`. The five tests cover safe status
mapping, valid and cross-product theme IDs, compatibility preservation,
standalone gallery rendering/assets, and the no-auto-publish contract.

Coverage was collected with native V8 and converted through c8's local
`Report` API; the c8 CLI was not invoked. The nine-file figures are explicitly
partial to this focused HTTP batch, not a replacement for the broader
Phase 2H nine-file baseline. Real route-level HTTP preview/security cases
remain a gap; existing lifecycle and management route tests provide separate
integration evidence.

