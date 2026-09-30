# BlessBoard Release Notes

Customer-facing BlessBoard release notes. Runtime Release Notes Center reads structured
equivalents from `src/platform/release-notes/releaseNotesCatalog.js` (`productNarratives`).

**Frozen V2.04 application candidate:** `c16c791f9a4d102aa213debb3f4f0975c258c487`  
(Hosted repository tip may be a later docs-only descendant; do not redefine the application candidate.)

---

## Version 2.04

Version 2.04 strengthens BlessBoard's website management experience and moves more of the platform onto a common foundation shared across GetPro products.

### Website Management

- Upgraded the BlessBoard website system to the shared GetPro website platform.
- Improved website draft, preview, publish, unpublish, version history, and restore workflows.
- Improved reliability when making several edits to the same website field in succession.
- Improved detection of genuine editing conflicts while eliminating false conflict messages during normal repeated editing.
- Improved website media handling, including uploads, media selection, replacement, and removal.
- Standardized website editing infrastructure so future improvements can be delivered more consistently across the platform.

### Design and Theme System

- Introduced a centralized platform color and theme system.
- Standardized colors according to their purpose, including primary actions, secondary actions, success, warning, error, backgrounds, borders, text, and interactive states.
- Preserved BlessBoard's own visual identity while sharing the underlying design infrastructure with other GetPro products.
- Improved consistency across public pages, management screens, registration, authentication, and website editing.
- Added safeguards against accidental cross-product theme leakage.

### Registration and Location

- Improved organization registration with shared Country and City fields.
- Added country-aware city autocomplete for supported markets.
- Added a centralized geographic catalogue used by the platform.
- Added support for manual city entry where a country does not yet have a city catalogue.
- Improved handling when a user changes country after selecting a city.
- Province/region information remains available internally for future use but is no longer required during registration.

### Platform Improvements

- Consolidated website editing, media, draft, publishing, versioning, and restoration capabilities into shared platform services.
- Reduced duplicate product-specific website infrastructure.
- Improved tenant isolation, authorization, and concurrent-edit protection.
- Improved responsive behavior and accessibility across website-management experiences.
- Improved browser asset versioning to prevent older cached styles or scripts from appearing after an update.

### Reliability and Quality

- Expanded automated testing for website management, registration, geography, themes, authorization, tenant isolation, media, publishing, and concurrent editing.
- Improved clean-database installation and migration verification.
- Resolved a testing-environment geography configuration issue and verified the shared country and city catalogue.

---

## Version 2.03

Version 2.03 focused on platform consolidation, website reliability, media handling, and stronger quality assurance across BlessBoard.

### Website and Content Management

- Improved website editing and publishing reliability.
- Expanded inline editing coverage across BlessBoard website sections.
- Improved image editing and upload support across editable website content.
- Improved leadership, ministry, event, giving, sermon, and other website content editing.
- Improved handling of website drafts and published content.
- Improved website version history and restore workflows.

### Media

- Expanded shared media upload support across website editors.
- Improved persistence of uploaded images.
- Improved media handling for sermon thumbnails and other website content.
- Reduced reliance on product-specific upload behavior by using shared platform media infrastructure.

### Sermons and Announcements

- Improved sermon thumbnail support.
- Improved sermon date validation.
- Improved announcement media uploads.
- Strengthened validation for content-management operations.

### Registration and Phone Numbers

- Improved Zambia phone-number handling.
- Registration accepts common local and international Zambia number formats and normalizes them consistently.
- Improved shared registration infrastructure in preparation for broader platform reuse.

### Platform Architecture

- Continued consolidation of common BlessBoard and ActiveClinic capabilities into the GetPro platform layer.
- Improved shared product adapters and platform services.
- Reduced duplicated website and registration logic.
- Strengthened separation between shared platform capabilities and BlessBoard-specific church functionality.

### Quality and Reliability

- Expanded automated regression and QA coverage.
- Strengthened publishing authorization tests.
- Improved tenant-isolation and role-based access checks.
- Improved image persistence and editor reliability.
- Added broader regression coverage for critical BlessBoard management workflows.
