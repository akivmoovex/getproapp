# V2134 G333 website editor responsive QA

STATUS=PASS  
SUITE=`tests/e2e/v13/v13-ac-cms-responsive.spec.js`  
DATABASE=getpro_v13_e2e_g78d2301  
RUNS=1/1 and 1/1  
VIEWPORTS=390x844, 768x1024, 1440x900

The suite registers a fresh clinic and uses the existing website editor. It does not use the Stitch 780px booking-filters chrome.

| Check | 390 | 768 | 1440 |
| --- | --- | --- | --- |
| Editor navigation visible | Pass. Rail nav shown, desktop tabs hidden. | Pass. Rail nav shown, desktop tabs hidden. | Pass. Desktop tabs shown. |
| No horizontal overflow | Pass | Pass | Pass |
| Text section, empty title announced | Pass at 390 via `[data-ac-section-validation]` | Covered by the same editor | Covered by the same editor |
| Text section save | Pass. Keyboard tab moves from title to heading. Button remains "Save Changes". | | |
| Draft preview | Pass. Heading is on the draft URL and absent from the public URL. | | |
| Image section alt text | Pass. Empty alt is announced and `aria-invalid=true`. Alt "Clinic entrance" then saves. | | |
| Draft versus published comparison | | Pass. No overflow. | Pass. Comparison width is greater than 700px. |
| Publish | Pass. Confirm dialog accepted. Heading appears on the public page only after publish. Public page has no overflow. | | |

## Layout fix

`.ac-mw-form` is `width: 100%`, `max-width: min(40rem, 100%)`, and `box-sizing: border-box`. Text inputs, selects, and textareas use the same box sizing and cannot exceed the form. Below 900px the editor content keeps `0.75rem` of side padding, the desktop tab strip stays hidden, and the rail nav is the navigation. From 900px the draft/published comparison is two columns.

Existing ActiveClinic platform coverage of the website editor also passed inside the 36-test browser suite, twice, with the responsive flag off.
