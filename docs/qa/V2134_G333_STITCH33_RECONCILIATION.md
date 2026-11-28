# V2134 G333 Stitch concept 33 reconciliation

STATUS=PRESENT_VIA_GET_SCREEN_ABSENT_FROM_LIST_SCREENS  
SCREENS_GENERATED=NO  
MASKED_PREVIEW_IMPLEMENTED=NO  
CHART_FIRST_BEHAVIOR=PRESERVED

`list_screens` on the public ActiveClinic project previously returned 254 screens and did not include an `AC-V2134-33` title. Direct `get_screen` still returns both historic IDs on that project.

| Screen | Project | get_screen |
| --- | --- | --- |
| `b88c5a67069d41248904df37fba52601` | `17813606734422395399` public | Found. Title "AC-V2134-33 — Existing Patient Not Found / Chart-First Registration Refusal - Desktop". DESIGN. 2560x3132. |
| `bdc8edfc211847a981582fe9b5bd0391` | `17813606734422395399` public | Found. Title "AC-V2134-33 — Existing Patient Not Found / Chart-First Registration Refusal - Mobile". DESIGN. 780x2974. |
| Both IDs | `12272131183982732110` internal | Requested entity was not found. |
| Both IDs | `10611909237747031838` authentication | Requested entity was not found. |

The desktop screen text is a chart-first refusal: no clinical record matches, a new medical record cannot be created online, and the shown phone, date of birth, and clinic reference are masked. Actions are return to patient login, try different lookup details, and recover an existing sign-in. Lookup is described as throttled.

That masked public preview was not built. No replacement screen was generated. The product still refuses an unmatched public registration with no new chart. The patient OTP browser suite checks that refusal on the isolated clinic.
