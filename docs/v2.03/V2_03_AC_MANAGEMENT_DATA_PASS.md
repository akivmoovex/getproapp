# V2.03 AC Management & Data Pass — ACN25–ACN26

**Verdict:** `V2_03_AC_MANAGEMENT_DATA_PASS`

**Stitch project:** `projects/12272131183982732110` (internal ops; audit inventory IDs recorded)  
**Branch:** V10  
**Scope:** Clinic Performance Dashboard; Import/Export Centre

| Screen | Stitch IDs | Route |
|--------|------------|-------|
| ACN25 Performance Dashboard | `b834a9b768664c1d91302a0aa1b79b7c` / `1615176a78ac4a88a77f71712c6671a6` (visual fallback P01 `390032bf…` / `8be466d4…`) | `GET /app/performance` |
| ACN26 Import/Export Centre | `4137e48363914fa1be8a0bff9b3970c3` / `ef7f27a94f464d6daa4d39d0a81771d9` | `GET/POST /app/data…` |

## Delivered

### ACN25
- Aggregates: appointments, completed, cancellations, no-shows, avg wait (queue), revenue (RBAC-gated), popular services.
- Filters: date range, practitioner, location (selected facility — never forged).
- SQL aggregates only; **no clinical narratives / diagnoses / SOAP**.

### ACN26
- Import workflow: select type → upload → validate → preview (errors/warnings) → confirm → result.
- Permitted import: `ac.setup_catalogue` (charge catalogue setup).
- Exports: patients, appointments, services, financial summaries (facility-scoped CSV).
- **Platform** owns job lifecycle, file validation, artifact download, audit/status events.
- **AC adapters** own schemas, validation rules, mappings (`activeClinicDataJobAdapters.js`).
- BlessBoard can register `bb.*` adapters on the same shell later.

### Platform extensions
- `dataJobFileValidation.js`, `dataJobArtifactStore.js`
- `previewDataJobImport` / `commitDataJobImport` / `runDataJobExport` / `downloadDataJobArtifact`

### RBAC
- Migration `118_activeclinic_management_data_permissions.sql`
- Permissions: `activeclinic.performance.view`, `activeclinic.data.import`, `activeclinic.data.export`

## Tests

- `tests/activeclinic-batch1a-management-data.test.js`

## Gaps (non-blocking)

1. ACN25/26 Stitch screen assets from Batch 1 audit inventory were not present in the live MCP catalogue at implement time; audit IDs are wired as markers with P01 dashboard as visual fallback for performance chrome.
2. Import commit creates a sibling job from preview (clearer audit trail) rather than mutating a terminal preview job.
3. Artifacts are process-local memory refs (adequate for Batch 1; durable blob store later).
