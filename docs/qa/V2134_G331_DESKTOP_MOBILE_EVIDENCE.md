# V2134 G331 desktop and mobile evidence

STITCH_DESKTOP_VERIFIED=NO  
STITCH_TABLET_VERIFIED=NO  
STITCH_MOBILE_VERIFIED=NO  
SCREENSHOTS_CAPTURED=NO  

No Stitch frame was implemented, so this session did not capture before-and-after screenshots and does not claim parity at 1440, 768, or 390.

## What was measured

Live public-project frames:

| Label in Stitch | Actual width | Count |
| --- | ---: | ---: |
| DESKTOP | 2560 | 113 |
| MOBILE | 780 | 141 |

There is no 390-wide frame and no 768-wide frame in that project. Copying the 780-wide mobile art would reproduce the booking-filters chrome the previous audit rejected. That chrome was not added to the application.

The ActiveClinic and BlessBoard Playwright runs used the desktop device in the existing configs. They check behavior. They are not a responsive visual audit.

## Responsive work left undone

Usable 390-wide layouts for the numbered clinical, CMS, and authentication screens still need a design pass that is not the 780-wide export. Tablet 768 was not available as a Stitch width to compare.
