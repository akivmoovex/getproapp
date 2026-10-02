# ActiveClinic V7 — Website engine checkpoint

**Status:** `READY_WITH_NONBLOCKING_GAPS`  
**Environment:** hosted testing only (`moovex-platform-v7` / `testing`)  
**Constraint:** production untouched; BlessBoard `public_pages` remains authoritative

This checkpoint records the shared website engine used by ActiveClinic clinic sites. It does not migrate BlessBoard CMS.

## Nonblocking / future items

- BlessBoard `public_pages` remains the church-website source of truth
- No BlessBoard dual-write or cutover
- BlessBoard branch inheritance is not represented by the shared engine
- BlessBoard media, HQ review, and entity (sermons/giving/ministries) migration remain future work
- Booking wizard lacks inline editor chrome
- Pricing catalogue may be empty
- Orphan media cleanup remains `manual_review` (nothing auto-deleted)

## Hosted testing notes

- Website migrations: platform `027`, BlessBoard `093`, ActiveClinic `026`
- Existing testing clinics were backfilled idempotently (`activeclinic-demo`, `julflona-clinic`)
- Platform Admin review lives on BlessBoard apex (`/admin/website-changes`), not the ActiveClinic tenant app
