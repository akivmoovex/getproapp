# Clinical operations fixes

Laboratory writes that already required an organization now repeat that requirement on the update, and they roll back when the row no longer matches.

| Write | Predicate now on the update |
|---|---|
| Collect | Organization, healthcare organization, facility, and `pending_collection` |
| Receive specimen | Organization, healthcare organization, and `collected` |
| Receive request | Organization and healthcare organization |
| Reject specimen and request | Organization and healthcare organization. No new status was added |
| Result | Organization, healthcare organization, facility, and the existing resultable statuses. A miss rolls back the result insert |
| Release | The result must still be `verified` in that organization. The request update uses the same organization |

Stock receipt now selects and locks the inventory row with `organization_id`. A miss rolls back with `inventory_item_not_found`. No substitution function and no allergy block were added. Critical acknowledgement is unchanged: it still follows the result’s patient and does not escalate.
