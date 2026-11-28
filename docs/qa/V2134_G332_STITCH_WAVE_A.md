# V2134 G332 Stitch Wave A

Project: `17813606734422395399`  
Retrieved with `get_screen` on 28 Nov 2026. HTML was inspected locally and was not copied into the repository.

## Screens

| Concept | Screen | ID | Device | Size |
| --- | --- | --- | --- | --- |
| 16 Text-section editor | AC-V2134-16 | `4d200465b37d4361a2abf1ff0834b2dc` | DESKTOP | 2560×2234 |
| 17 Image-section editor | AC-V2134-17 | `b3bb570cc061466c9bb711a31f2f594d` | DESKTOP | 2560×2324 |
| 17 Image-section editor | AC-V2134-17 | `3020c12c34204408acc6eb25449be2bd` | MOBILE | 780×3492 |
| 18 Draft versus published | AC-V2134-18 | `0ed58379267a4086afeab0862d0774bd` | DESKTOP | 2560×2650 |
| 18 Draft versus published | AC-V2134-18 | `d28ddfff293c4c738e6d82bc4b540ff1` | MOBILE | 780×3662 |

There is no mobile companion for concept 16. The 780px frames are the Stitch mobile canvas. They were not used as a booking-filter chrome, and their booking-style frame was not copied.

## What the designs show

The text editor is a draft form with a required title, body, a layout choice, save, preview, and publish, plus a live preview. The image editor adds an authorized-library picker, alt text, a required-alt validation message, and a saved-success message. The comparison screen shows the published page beside the pending draft, a publish confirmation, and a discard failure message.

## What V13 now shows

The existing section route, save handler, upload rules, and publish route are unchanged.

- Text and image section settings name the draft and the published site side by side.
- Image alt text stays required and is described for assistive technology.
- An empty required field reveals an alert and marks the field invalid.
- The save button remains "Save Changes". The status text says the save stays a draft until publish.
- The publish page shows the last published label beside the unpublished change list.
- The comparison stacks in one column below 900px and uses two columns from 900px up, with the existing ActiveClinic website tokens.
- Anonymous visitors still see a section only after publication. That rule was not changed.

The design's rich-text toolbar, focal-point cropper, invented clinic fees, and sample publish success toast were not added. Those would need new editor behavior or sample data the current schema does not store on this page.

## Browser check

The ActiveClinic platform browser suite, which saves and publishes website sections, passed 36/36 twice on desktop Playwright. A separate mobile viewport was not opened for this editor.
