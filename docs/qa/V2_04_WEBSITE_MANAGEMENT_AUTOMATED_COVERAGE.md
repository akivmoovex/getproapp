# V2.04 Website Management — Automated Coverage

**Suite:** `tests/v2-04-website-management-platform-contract.test.js`  
**Registry:** `src/platform/website/websiteManagementFeatureContract.js`  
**Preserved packs:** viewport, AC catalogue shell, AC blank pages, BB publish, AC public go-live, defect pack.

## Coverage map

| Area | How covered |
|------|-------------|
| AC option registry | Contract enumerates 12 options; route registration + template markers asserted |
| BB option registry | Contract enumerates 12 options; handler registration scanned across `src/blessboard/http` |
| Shared platform features | 18 capabilities listed; adapters for AC/BB |
| Parity matrix | Asserts no open `BB_GAP`; AC_ONLY_BY_DESIGN for Navigation/Chrome |
| Lifecycle steps | DRAFT…REPUBLISH constants present |
| Responsive viewport | `editorViewportFrame` + BB/AC chrome attach still wired |
| Version preview | Stitch `websitePresentation` in governance preview |
| Publish readiness / go-live | BB engine contact OR; AC `wantsPublic` availability |
| Platform purity | Platform modules must not hard-require ActiveClinic |
| Admin link crawl (static) | AC hub+CMS nav hrefs; BB hub action tiles including branding/library/settings |

## Related regression packs (must stay green)

| Pack | File |
|------|------|
| Responsive iframe | `tests/v2-04-website-editor-real-viewport.test.js` |
| AC catalogue GUI | `tests/v2-04-ac-catalogue-gui-shell-fix.test.js` |
| AC blank pages | `tests/v2-04-ac-website-admin-blank-page.test.js` |
| Final defect pack | `tests/v2-04-final-engineering-defect-pack.test.js` |
| BB publish | `tests/blessboard-church-website-publish.test.js` |

## Functional actions

Deep mutation integration remains in `tests/activeclinic-website-cms.test.js` and BB publish/lifecycle suites. This consolidation pack adds the **shared contract + hub parity** layer so one product cannot silently lose management surfaces.

## Counts (contract suite)

See END markers from the consolidation run.
