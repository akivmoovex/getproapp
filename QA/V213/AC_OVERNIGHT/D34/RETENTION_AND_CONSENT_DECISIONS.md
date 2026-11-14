# Retention and consent decisions

These decisions stay pending. This stage does not choose a period or a disclosure rule.

| Decision | Current code | Still required |
|---|---|---|
| D21-09 retention and disposal | No legal hold and no deleter | Zambia periods from a legal owner. Expiry must not delete |
| D29-16 consent, representative, witness | Types include treatment and data processing. Statuses include granted and withdrawn. Capture methods include `guardian_verbal` and `guardian_written` | A representative identity. Guardian methods are not that record |
| D21-10 hosting and controller roles | No controller record in the repository | Hosting location and who is controller or processor |

A forged organization id on consent returns `forged_tenant` before a query. The mapped consent has no representative id and no legal hold.

`RET-01-02` is not satisfied by the absence of a deleter. There is still no approval gate. `RET-01-03` has no two-person disposal and no certificate. No record was disposed of.
