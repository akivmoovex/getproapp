# Facility features

Department lookup stays `WHERE id = $1 AND organization_id = $2` in `activeClinicDepartmentService.js`. The D72 test still rejects a department list that has no staff member before a query.

Facility checks on encounters, queues, and documents stay in the D73 and D75 services. No facility field, department type, room, or wing was added. No schema change was made.
