# ActiveClinic Stitch → V7 Implementation Mapping

**Generated:** 2026-08-12T00:37:40.572Z  
**Inputs:** Stitch raw inventory (388) + V7 implementation raw inventory (213)  
**Phase 4:** remapped former STITCH_NOT_IMPLEMENTED rows only

---

## A. Safety

| Field | Value |
|-------|-------|
| branch | V7 |
| HEAD | `2ee3c6652134411a30d2ea8dbc18ed1229936222` |
| DEPLOYMENT_ENV | testing |
| DB identity | moovex-platform-v7 |
| production touched | no |
| pushed | no |
| deployed | no |

---

## B. Mapping counts

| mapping_type | Count |
|--------------|------:|
| MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION | 218 |
| PARTIAL_IMPLEMENTATION | 77 |
| EXACT_IMPLEMENTATION_MATCH | 66 |
| DUPLICATE_STITCH_VARIANT | 8 |
| NO_IMPLEMENTATION_REQUIRED | 8 |
| PRODUCT_DECISION_DIFFERENCE | 6 |
| ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS | 5 |

### Coverage

| Bucket | Count |
|--------|------:|
| Full | 289 |
| Partial | 77 |
| Missing | 0 |
| Other | 22 |
| Total | 388 |

### Desktop / Mobile

| Device | Full | Partial | Missing | Other | Total |
|--------|-----:|--------:|--------:|------:|------:|
| Desktop | 176 | 51 | 0 | 10 | 237 |
| Mobile | 113 | 26 | 0 | 12 | 151 |

Phase 4 target: Missing 21 → 0.
