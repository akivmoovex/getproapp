# GetPro Platform Backlog

Canonical product backlog for cross-product deferred work. ActiveClinic visual backlog remains in `docs/activeclinic/stitch/ACTIVECLINIC_V7_VISUAL_BACKLOG.md`.

## Location governance

### AC-LOCATION-01 — Approve user-added cities/towns

Future Platform Admin capability:

- list user-created locations
- filter by country
- inspect normalized/canonical names
- approve
- merge duplicates
- rename/correct
- reject/archive
- preserve clinics already using the location
- audit who created/approved it

POST-V1. Must not block registration.

### AC-LOCATION-02 — Southern Africa administrative subdivisions

Add first-class province/state/region dropdown data for supported Southern African countries.

At minimum investigate:

- Angola
- Botswana
- Eswatini
- Lesotho
- Malawi
- Mozambique
- Namibia
- South Africa
- Zambia
- Zimbabwe

Store:

- country
- subdivision code if available
- canonical name
- display name
- subdivision type
- active status

Registration should choose dropdown data where supported and free text otherwise.

POST-V1 unless shared subdivision infrastructure is already nearly available.

## Website engine

### AC-WEBSITE-01 — Consolidate legacy website content projections

Track remaining shared-engine / legacy CMS projection debt across ActiveClinic and BlessBoard where tenant website content still flows through parallel paths (legacy inline fields, structured drafts, platform.website_content). Goal: one authoritative projection per surface without breaking tenant publish flows.

POST-V1. Do not block Platform 02 deployment.
