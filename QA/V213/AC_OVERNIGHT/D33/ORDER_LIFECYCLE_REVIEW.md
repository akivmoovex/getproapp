# Order lifecycle review

Package D in the D29 traceability file is these 9 IDs: `ORD-01-01`, `ORD-01-02`, `ORD-01-03`, `LAB-01-01`, `LAB-01-02`, `LAB-01-03`, `RX-01-01`, `RX-01-02`, `RX-01-03`.

Clinical orders are stored as `draft`, `submitted`, or `cancelled`. The proposed chain `DRAFT`, `PLACED`, `ACKNOWLEDGED`, `IN_PROGRESS`, `RESULTED`, `REVIEWED` is not stored.

A department failure in the middle of a handoff has no transaction that puts the order back. `ORD-01-03` stays missing. D21-02 is still pending, so the stored three states stay.

Result rows are entered through the diagnostics service. Wrong-patient attachment was not executed. `ORD-01-02` stays partial.

No order state was renamed and no migration was added.
