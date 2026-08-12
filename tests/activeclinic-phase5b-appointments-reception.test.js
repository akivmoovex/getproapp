"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("ActiveClinic V7 Phase 5B appointment and reception closure", () => {
  it("wires appointment summary, detail, cancel, reschedule, success, missed, and schedule screens", () => {
    const routes = read("src/activeclinic/http/activeClinicAppointmentRoutes.js");
    const loaders = read("src/activeclinic/services/loadActiveClinicAppointmentScreens.js");
    const list = read("views/activeclinic/app/appointments-list-content.ejs");
    const detail = read("views/activeclinic/app/appointment-detail-content.ejs");
    const form = read("views/activeclinic/app/appointment-form-content.ejs");
    const cancel = read("views/activeclinic/app/appointment-cancel-content.ejs");
    const success = read("views/activeclinic/app/appointment-success-content.ejs");
    const missed = read("views/activeclinic/app/appointments-missed-content.ejs");
    const schedule = read("views/activeclinic/app/appointments-schedule-content.ejs");

    assert.match(list, /data-ac-status-summary="appointments"/);
    assert.match(list, /Scheduled[\s\S]*Confirmed[\s\S]*Checked in[\s\S]*No-show[\s\S]*Cancelled/);
    assert.match(detail, /appointment-detail/);
    assert.match(detail, /actions\.cancelHref/);
    assert.doesNotMatch(detail, /name="reason"[\s\S]*Cancel appointment/);
    assert.match(routes, /\/app\/appointments\/:appointmentId\/cancel/);
    assert.match(cancel, /Confirm cancellation/);
    assert.match(routes, /cancelAppointment/);
    assert.match(routes, /\/app\/appointments\/:appointmentId\/reschedule/);
    assert.match(routes, /if \(!values\.confirm\)/);
    assert.match(routes, /rescheduleAppointment/);
    assert.match(form, /Review reschedule/);
    assert.match(routes, /\/app\/appointments\/:appointmentId\/confirmed/);
    assert.match(routes, /appointment-success-content\.ejs/);
    assert.match(success, /Appointment confirmed/);
    assert.match(routes, /\/app\/appointments\/missed/);
    assert.match(missed, /data-ac-page-section="appointments-missed"/);
    assert.match(routes, /\/app\/appointments\/schedule/);
    assert.match(schedule, /data-ac-staff-schedule/);
    assert.match(loaders, /statusSummary/);
    assert.match(loaders, /loadActiveClinicAppointmentSuccessScreen/);
    assert.match(loaders, /loadActiveClinicAppointmentCancelScreen/);
    assert.match(loaders, /loadActiveClinicAppointmentRescheduleScreen/);
    assert.match(loaders, /loadActiveClinicAppointmentMissedScreen/);
    assert.match(loaders, /loadActiveClinicAppointmentScheduleScreen/);
  });

  it("wires dedicated reception assignment, transfer, called, did-not-respond, and stale states", () => {
    const routes = read("src/activeclinic/http/activeClinicReceptionRoutes.js");
    const loaders = read("src/activeclinic/services/loadActiveClinicReceptionScreens.js");
    const detail = read("views/activeclinic/app/reception-queue-detail-content.ejs");
    const assign = read("views/activeclinic/app/reception-queue-assign-content.ejs");
    const transfer = read("views/activeclinic/app/reception-queue-transfer-content.ejs");
    const called = read("views/activeclinic/app/reception-queue-called-content.ejs");
    const noResponse = read("views/activeclinic/app/reception-queue-did-not-respond-content.ejs");

    assert.match(routes, /\/app\/reception\/queue\/:entryId\/assign/);
    assert.match(routes, /assignQueueEntryRoom/);
    assert.match(assign, /Save assignment/);
    assert.match(routes, /\/app\/reception\/queue\/:entryId\/transfer/);
    assert.match(routes, /Transfer to \$\{destination\.displayName\}/);
    assert.match(transfer, /service_point_id/);
    assert.match(transfer, /does not create a new destination queue entry/);
    assert.match(routes, /\/app\/reception\/queue\/:entryId\/called/);
    assert.match(routes, /res\.redirect\(303, `\/app\/reception\/queue\/\$\{input\.queueEntryId\}\/called`\)/);
    assert.match(called, /Patient called/);
    assert.match(routes, /\/app\/reception\/queue\/:entryId\/did-not-respond/);
    assert.match(routes, /toStatus: "waiting"/);
    assert.match(noResponse, /Return to waiting/);
    assert.match(detail, /data-ac-stale-warning="bf9b846da6174bf995793b09e869cd30"/);
    assert.match(detail, /\/assign/);
    assert.match(detail, /\/transfer/);
    assert.match(detail, /\/did-not-respond/);
    assert.match(loaders, /loadActiveClinicReceptionCalledScreen/);
    assert.match(loaders, /loadActiveClinicReceptionDidNotRespondScreen/);
    assert.match(loaders, /loadActiveClinicReceptionAssignScreen/);
    assert.match(loaders, /loadActiveClinicReceptionTransferScreen/);
  });

  it("retains RBAC, facility isolation, and CSRF enforcement on mutation routes", () => {
    const appointmentRoutes = read("src/activeclinic/http/activeClinicAppointmentRoutes.js");
    const receptionRoutes = read("src/activeclinic/http/activeClinicReceptionRoutes.js");
    const appointmentService = read("src/activeclinic/services/activeClinicAppointmentService.js");
    const receptionService = read("src/activeclinic/services/activeClinicReceptionService.js");

    assert.match(appointmentRoutes, /requirePermission\(PERM\.CANCEL\)/);
    assert.match(appointmentRoutes, /requirePermission\(PERM\.UPDATE\)/);
    assert.match(receptionRoutes, /requirePermission\(PERM\.MANAGE_QUEUE\)/);
    assert.match(receptionRoutes, /requirePermission\(PERM\.TRANSFER\)/);
    assert.match(appointmentRoutes, /validateCsrf/);
    assert.match(receptionRoutes, /validateCsrf/);
    assert.match(appointmentRoutes, /CSRF validation failed/);
    assert.match(receptionRoutes, /CSRF validation failed/);
    assert.match(appointmentService, /healthcareOrganizationId/);
    assert.match(appointmentService, /facilityIds\.includes/);
    assert.match(receptionService, /healthcareOrganizationId/);
    assert.match(receptionService, /facilityIds \|\| \[\]\)\.includes/);
  });
});
