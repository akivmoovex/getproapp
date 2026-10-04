# ActiveClinic Release Notes

Customer-facing ActiveClinic release notes. Runtime Release Notes Center reads structured
equivalents from `src/platform/release-notes/releaseNotesCatalog.js` (`productNarratives`).

---

## Version 2.07

Shared release and verification alignment update.

### What's new

- Password recovery QA passed using the testing-delivery outbox/capture.
- RBAC, product-isolation, and tenant-isolation verification passed.
- No ActiveClinic product defect was reproduced in this sanity-fix batch.
- Shared release and About version alignment updated to 2.07.

---

## Version 2.05

**Title:** ActiveClinic 2.05

A major administration and website-management update that unifies clinic operations, website editing and publishing in one consistent Admin Console.

### New Admin Console

- Dashboard is now the default landing page after clinic registration or staff administrator login.
- Consistent navigation for Dashboard, Website, Content, People, Operations, Locations, Media, Reports, Access and Settings.
- Organization and clinic-location aware administration.

### Website Management

- Website is now a primary Admin Console section.
- View website status, draft changes, current theme, domain and publish readiness.
- Desktop, tablet and mobile live preview.

### Website Editing

- Edit text and images.
- Add, edit, reorder and remove sections.
- Manage clinic media.
- Support YouTube video content where available.
- Save as draft before publication.

### Themes & Live Preview

- Three presentation themes:
  - Clarity
  - Editorial
  - Community
- Switch presentation without altering underlying services, doctors, locations or content.
- Preview at desktop, tablet and mobile widths.

### Publishing

- Review changes before publication.
- Publish through Admin Console Website Management or the website editor.
- Publish reminder after multiple meaningful unpublished changes.
- Version history, historical preview, unpublish and restore-as-new preserved.

### Organization & Location Management

- Administration structure supports organization/HQ and clinic-location contexts.
- Location-scoped permissions and website/content management foundations.
- Content structure supports articles, clinic news, announcements and activities.

### Known limitations

- YouTube embedding support is being completed across all public website presentation paths.

---

## Version 2.04

Version 2.04 improves ActiveClinic public and management website experiences and shares registration improvements with the GetPro platform.

### Clinic registration

- Fixed multi-step registration state persistence so previous-step data survives forward/back navigation, refresh, and validation failures.
- Shared Country and City registration fields with country-aware city suggestions where catalogues exist.

### Website experience

- Updated public clinic website presentation.
- Clinic website management hub for draft, media, and publishing workflows on the shared platform engine.
