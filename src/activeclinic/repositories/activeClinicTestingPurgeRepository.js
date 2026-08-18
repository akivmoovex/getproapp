"use strict";

/**
 * Allowlisted SQL for testing-only ActiveClinic tenant cleanup.
 *
 * Never discovers DELETE targets dynamically. Never disables FK constraints.
 * Never uses CASCADE except existing schema ON DELETE behaviour.
 *
 * Safe delete order (after operational blockers are proven empty):
 *  1. clinic_registration_review_events (by this org's applications)
 *  2. clinic_registration_applications (this organization_id only)
 *  3. staff_role_assignments, staff_facility_assignments, staff_invitations
 *  4. departments, service_points, queue_priorities, appointment_service_types
 *  5. patient_number_counters, charge_catalogue_items, medication_catalogue_items,
 *     public_procedures
 *  6. staff_members
 *  7. facilities
 *  8. healthcare_organizations
 *  9. platform website/org tree via purgeOrganizationTree
 * 10. unused tenant-owned platform.identities (only when unreferenced)
 *
 * Registration policy: delete test application + review events. Review history is
 * documented append-only in comments but has no prevent-delete trigger; FK RESTRICT
 * on applications → organization would otherwise block org removal. Unrelated
 * applications are never selected.
 */

const {
  purgeOrganizationTree,
  listPlatformAdminPreserveSet,
} = require("../../platform/repositories/testingDataResetRepository");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENT_RE = /^[a-z][a-z0-9_]*$/;
const QUALIFIED_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

const RESERVED_ORGANIZATION_KEYS = Object.freeze(["activeclinic-demo", "julflona-clinic"]);

const PRODUCTION_HOSTNAME_RE =
  /(^|\.)(blessboard\.com|activeclinic\.org|getpro\.app)$/i;

/** Setup rows that a disposable onboarding clinic may own. Deleted only after blockers are empty. */
const SETUP_ORG_TABLES = Object.freeze([
  { key: "staffRoleAssignments", table: "activeclinic.staff_role_assignments", column: "organization_id" },
  { key: "staffFacilityAssignments", table: "activeclinic.staff_facility_assignments", column: "organization_id" },
  { key: "staffInvitations", table: "activeclinic.staff_invitations", column: "organization_id" },
  { key: "departments", table: "activeclinic.departments", column: "organization_id" },
  { key: "servicePoints", table: "activeclinic.service_points", column: "organization_id" },
  { key: "queuePriorities", table: "activeclinic.queue_priorities", column: "organization_id" },
  { key: "appointmentServiceTypes", table: "activeclinic.appointment_service_types", column: "organization_id" },
  { key: "medicationCatalogueItems", table: "activeclinic.medication_catalogue_items", column: "organization_id" },
  { key: "publicProcedures", table: "activeclinic.public_procedures", column: "organization_id" },
  { key: "staffMembers", table: "activeclinic.staff_members", column: "organization_id" },
  { key: "facilities", table: "activeclinic.facilities", column: "organization_id" },
  { key: "healthcareOrganizations", table: "activeclinic.healthcare_organizations", column: "organization_id" },
  { key: "clinicRegistrationApplications", table: "activeclinic.clinic_registration_applications", column: "organization_id" },
]);

const SETUP_TENANT_TABLES = Object.freeze([
  { key: "chargeCatalogueItems", table: "activeclinic.charge_catalogue_items", column: "tenant_id" },
]);

/** Clinical / financial / booking history — refuse rather than guess a delete graph. */
const BLOCKING_ORG_TABLES = Object.freeze([
  { key: "patients", table: "activeclinic.patients" },
  { key: "patientIdentifiers", table: "activeclinic.patient_identifiers" },
  { key: "patientEmergencyContacts", table: "activeclinic.patient_emergency_contacts" },
  { key: "patientRegistrations", table: "activeclinic.patient_registrations" },
  { key: "patientFacilityLinks", table: "activeclinic.patient_facility_links" },
  { key: "patientPortalLinkEvents", table: "activeclinic.patient_portal_link_events" },
  { key: "appointments", table: "activeclinic.appointments" },
  { key: "appointmentStatusEvents", table: "activeclinic.appointment_status_events" },
  { key: "appointmentReminderRequests", table: "activeclinic.appointment_reminder_requests" },
  { key: "encounters", table: "activeclinic.encounters" },
  { key: "encounterEvents", table: "activeclinic.encounter_events" },
  { key: "triageAssessments", table: "activeclinic.triage_assessments" },
  { key: "vitalSignObservations", table: "activeclinic.vital_sign_observations" },
  { key: "nursingIntakeNotes", table: "activeclinic.nursing_intake_notes" },
  { key: "consultationNotes", table: "activeclinic.consultation_notes" },
  { key: "consultationNoteAmendments", table: "activeclinic.consultation_note_amendments" },
  { key: "clinicalDiagnoses", table: "activeclinic.clinical_diagnoses" },
  { key: "clinicalOrders", table: "activeclinic.clinical_orders" },
  { key: "clinicalAlerts", table: "activeclinic.clinical_alerts" },
  { key: "receptionArrivals", table: "activeclinic.reception_arrivals" },
  { key: "queueEntries", table: "activeclinic.queue_entries" },
  { key: "queueStatusEvents", table: "activeclinic.queue_status_events" },
  { key: "receptionNotes", table: "activeclinic.reception_notes" },
  { key: "pharmacyPrescriptions", table: "activeclinic.pharmacy_prescriptions" },
  { key: "pharmacyPrescriptionItems", table: "activeclinic.pharmacy_prescription_items" },
  { key: "dispenseEvents", table: "activeclinic.dispense_events" },
  { key: "dispenseItems", table: "activeclinic.dispense_items" },
  { key: "inventoryItems", table: "activeclinic.inventory_items" },
  { key: "inventoryBatches", table: "activeclinic.inventory_batches" },
  { key: "stockMovements", table: "activeclinic.stock_movements" },
  { key: "pharmacyPurchaseOrders", table: "activeclinic.pharmacy_purchase_orders" },
  { key: "pharmacyPurchaseOrderItems", table: "activeclinic.pharmacy_purchase_order_items" },
  { key: "laboratoryRequests", table: "activeclinic.laboratory_requests" },
  { key: "specimens", table: "activeclinic.specimens" },
  { key: "specimenEvents", table: "activeclinic.specimen_events" },
  { key: "laboratoryResults", table: "activeclinic.laboratory_results" },
  { key: "laboratoryResultComponents", table: "activeclinic.laboratory_result_components" },
  { key: "laboratoryResultAmendments", table: "activeclinic.laboratory_result_amendments" },
  { key: "radiologyRequests", table: "activeclinic.radiology_requests" },
  { key: "radiologyReports", table: "activeclinic.radiology_reports" },
  { key: "radiologyReportAmendments", table: "activeclinic.radiology_report_amendments" },
  { key: "publicContactInquiries", table: "activeclinic.public_contact_inquiries" },
  { key: "publicBookingRequests", table: "activeclinic.public_booking_requests" },
  { key: "publicBookingAccessTokens", table: "activeclinic.public_booking_access_tokens" },
]);

const BLOCKING_TENANT_TABLES = Object.freeze([
  { key: "patientCharges", table: "activeclinic.patient_charges" },
  { key: "invoices", table: "activeclinic.invoices" },
  { key: "cashierSessions", table: "activeclinic.cashier_sessions" },
  { key: "payments", table: "activeclinic.payments" },
  { key: "receipts", table: "activeclinic.receipts" },
  { key: "refunds", table: "activeclinic.refunds" },
  { key: "financialReversals", table: "activeclinic.financial_reversals" },
  { key: "paymentArrangements", table: "activeclinic.payment_arrangements" },
  { key: "creditNotes", table: "activeclinic.credit_notes" },
  { key: "billingCollectionsContacts", table: "activeclinic.billing_collections_contacts" },
  { key: "priceOverrideRequests", table: "activeclinic.price_override_requests" },
]);

const KNOWN_ACTIVECLINIC_TABLES = Object.freeze([
  ...SETUP_ORG_TABLES.map((t) => t.table.replace("activeclinic.", "")),
  ...SETUP_TENANT_TABLES.map((t) => t.table.replace("activeclinic.", "")),
  ...BLOCKING_ORG_TABLES.map((t) => t.table.replace("activeclinic.", "")),
  ...BLOCKING_TENANT_TABLES.map((t) => t.table.replace("activeclinic.", "")),
  "patient_number_counters",
  "clinic_registration_review_events",
  "invoice_lines",
  "cashier_session_events",
  "payment_allocations",
]);

/**
 * @param {string} table
 */
function assertQualified(table) {
  if (!QUALIFIED_RE.test(table)) {
    throw new Error("invalid_allowlisted_table");
  }
  return table;
}

/**
 * @param {string} column
 */
function assertIdent(column) {
  if (!IDENT_RE.test(column)) {
    throw new Error("invalid_allowlisted_column");
  }
  return column;
}

/**
 * @param {{ query: Function }} client
 * @param {string} sql
 * @param {unknown[]} [params]
 */
async function countSql(client, sql, params = []) {
  const r = await client.query(sql, params);
  return Number(r.rows[0] && r.rows[0].n) || 0;
}

/**
 * @param {{ query: Function }} client
 * @param {string} table
 * @param {string} column
 * @param {string} organizationId
 */
async function countWhere(client, table, column, organizationId) {
  const t = assertQualified(table);
  const c = assertIdent(column);
  return countSql(client, `SELECT COUNT(*)::int AS n FROM ${t} WHERE ${c} = $1`, [organizationId]);
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function findOrganizationByKey(client, organizationKey) {
  const key = String(organizationKey || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  const r = await client.query(
    `SELECT id, organization_key, display_name, status, data_environment, test_cleanup_eligible
       FROM platform.organizations
      WHERE organization_key = $1
      LIMIT 1`,
    [key]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} healthcareOrganizationId
 */
async function findOrganizationByHealthcareOrganizationId(client, healthcareOrganizationId) {
  if (!UUID_RE.test(String(healthcareOrganizationId || ""))) return null;
  const r = await client.query(
    `SELECT o.id, o.organization_key, o.display_name, o.status, o.data_environment,
            o.test_cleanup_eligible, h.id AS healthcare_organization_id
       FROM activeclinic.healthcare_organizations h
       INNER JOIN platform.organizations o ON o.id = h.organization_id
      WHERE h.id = $1
      LIMIT 1`,
    [healthcareOrganizationId]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function listActiveProductKeys(client, organizationId) {
  const r = await client.query(
    `SELECT p.product_key
       FROM platform.organization_products op
       INNER JOIN platform.products p ON p.id = op.product_id
      WHERE op.organization_id = $1
        AND op.status = 'active'
        AND p.status = 'active'`,
    [organizationId]
  );
  return r.rows.map((row) => String(row.product_key));
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function listDomainHostnames(client, organizationId) {
  const r = await client.query(
    `SELECT hostname FROM platform.domains WHERE organization_id = $1`,
    [organizationId]
  );
  return r.rows.map((row) => String(row.hostname));
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function loadScopedIds(client, organizationId) {
  const hco = await client.query(
    `SELECT id FROM activeclinic.healthcare_organizations WHERE organization_id = $1 ORDER BY created_at ASC`,
    [organizationId]
  );
  const healthcareOrganizationIds = hco.rows.map((row) => String(row.id));
  const facilities = await client.query(
    `SELECT id FROM activeclinic.facilities WHERE organization_id = $1 ORDER BY created_at ASC`,
    [organizationId]
  );
  const facilityIds = facilities.rows.map((row) => String(row.id));
  const staff = await client.query(
    `SELECT id, platform_identity_id
       FROM activeclinic.staff_members
      WHERE organization_id = $1
      ORDER BY created_at ASC`,
    [organizationId]
  );
  const staffIds = staff.rows.map((row) => String(row.id));
  const identityIds = [
    ...new Set(
      staff.rows
        .map((row) => (row.platform_identity_id ? String(row.platform_identity_id) : null))
        .filter(Boolean)
    ),
  ];
  const applications = await client.query(
    `SELECT id FROM activeclinic.clinic_registration_applications WHERE organization_id = $1`,
    [organizationId]
  );
  const applicationIds = applications.rows.map((row) => String(row.id));
  return {
    healthcareOrganizationIds,
    facilityIds,
    staffIds,
    identityIds,
    applicationIds,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 * @param {string[]} applicationIds
 */
async function countRegistrationReviewEvents(client, organizationId, applicationIds) {
  if (!applicationIds.length) return 0;
  return countSql(
    client,
    `SELECT COUNT(*)::int AS n
       FROM activeclinic.clinic_registration_review_events
      WHERE application_id = ANY($1::uuid[])`,
    [applicationIds]
  );
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 * @param {{ healthcareOrganizationIds: string[] }} scope
 */
async function collectCounts(client, organizationId, scope) {
  const counts = {
    organization: 1,
    healthcareOrganizations: scope.healthcareOrganizationIds.length,
    facilities: scope.facilityIds.length,
    staffMembers: scope.staffIds.length,
    identities: scope.identityIds.length,
    applications: scope.applicationIds.length,
  };

  for (const spec of SETUP_ORG_TABLES) {
    counts[spec.key] = await countWhere(client, spec.table, spec.column, organizationId);
  }
  for (const spec of SETUP_TENANT_TABLES) {
    counts[spec.key] = await countWhere(client, spec.table, spec.column, organizationId);
  }
  counts.patientNumberCounters = scope.healthcareOrganizationIds.length
    ? await countSql(
        client,
        `SELECT COUNT(*)::int AS n
           FROM activeclinic.patient_number_counters
          WHERE healthcare_organization_id = ANY($1::uuid[])`,
        [scope.healthcareOrganizationIds]
      )
    : 0;
  counts.clinicRegistrationReviewEvents = await countRegistrationReviewEvents(
    client,
    organizationId,
    scope.applicationIds
  );

  const operational = {};
  let operationalTotal = 0;
  for (const spec of BLOCKING_ORG_TABLES) {
    const n = await countWhere(client, spec.table, "organization_id", organizationId);
    operational[spec.key] = n;
    operationalTotal += n;
  }
  for (const spec of BLOCKING_TENANT_TABLES) {
    const n = await countWhere(client, spec.table, "tenant_id", organizationId);
    operational[spec.key] = n;
    operationalTotal += n;
  }
  operational.invoiceLines = await countSql(
    client,
    `SELECT COUNT(*)::int AS n
       FROM activeclinic.invoice_lines il
       INNER JOIN activeclinic.invoices i ON i.id = il.invoice_id
      WHERE i.tenant_id = $1`,
    [organizationId]
  );
  operationalTotal += operational.invoiceLines;
  operational.cashierSessionEvents = await countSql(
    client,
    `SELECT COUNT(*)::int AS n
       FROM activeclinic.cashier_session_events e
       INNER JOIN activeclinic.cashier_sessions s ON s.id = e.session_id
      WHERE s.tenant_id = $1`,
    [organizationId]
  );
  operationalTotal += operational.cashierSessionEvents;
  operational.paymentAllocations = await countSql(
    client,
    `SELECT COUNT(*)::int AS n
       FROM activeclinic.payment_allocations a
       INNER JOIN activeclinic.payments p ON p.id = a.payment_id
      WHERE p.tenant_id = $1`,
    [organizationId]
  );
  operationalTotal += operational.paymentAllocations;

  counts.websiteInstances = await countWhere(
    client,
    "platform.website_instances",
    "organization_id",
    organizationId
  );
  counts.websiteContent = await countWhere(
    client,
    "platform.website_content",
    "organization_id",
    organizationId
  );
  counts.websiteVersions = await countWhere(
    client,
    "platform.website_versions",
    "organization_id",
    organizationId
  );
  counts.websiteEditSessions = await countWhere(
    client,
    "platform.website_edit_sessions",
    "organization_id",
    organizationId
  );
  counts.websiteSubmissions = await countWhere(
    client,
    "platform.website_submissions",
    "organization_id",
    organizationId
  );
  counts.websiteModerationEvents = await countWhere(
    client,
    "platform.website_moderation_events",
    "organization_id",
    organizationId
  );
  counts.websiteAuditEvents = await countWhere(
    client,
    "platform.website_audit_events",
    "organization_id",
    organizationId
  );
  counts.websiteMedia = await countWhere(
    client,
    "platform.website_media",
    "organization_id",
    organizationId
  );
  counts.websiteMediaUsages = await countWhere(
    client,
    "platform.website_media_usages",
    "organization_id",
    organizationId
  );
  counts.auditEvents = await countWhere(
    client,
    "platform.audit_events",
    "organization_id",
    organizationId
  );

  return { counts, operational, operationalTotal };
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function listSharedMediaBlockers(client, organizationId) {
  const r = await client.query(
    `SELECT m.id, m.storage_key, u.organization_id AS other_organization_id
       FROM platform.website_media m
       INNER JOIN platform.website_media_usages u ON u.media_id = m.id
      WHERE m.organization_id = $1
        AND u.organization_id <> $1`,
    [organizationId]
  );
  return r.rows.map((row) => ({
    mediaId: String(row.id),
    storageKey: String(row.storage_key),
    otherOrganizationId: String(row.other_organization_id),
  }));
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function listOwnedMediaStorageKeys(client, organizationId) {
  const r = await client.query(
    `SELECT id, storage_key FROM platform.website_media WHERE organization_id = $1`,
    [organizationId]
  );
  return r.rows.map((row) => ({
    mediaId: String(row.id),
    storageKey: String(row.storage_key),
  }));
}

/**
 * @param {{ query: Function }} client
 * @param {string[]} applicationIds
 * @param {string} organizationId
 */
async function countSiblingDuplicateReferences(client, applicationIds, organizationId) {
  if (!applicationIds.length) return 0;
  return countSql(
    client,
    `SELECT COUNT(*)::int AS n
       FROM activeclinic.clinic_registration_applications other
      WHERE other.duplicate_of_application_id = ANY($1::uuid[])
        AND other.organization_id IS DISTINCT FROM $2`,
    [applicationIds, organizationId]
  );
}

/**
 * Fail closed on ActiveClinic tables that reference this org but are not in the allowlist.
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function listUnexpectedActiveClinicOrgReferences(client, organizationId) {
  const known = new Set(KNOWN_ACTIVECLINIC_TABLES);
  const catalog = await client.query(
    `SELECT c.relname AS table_name, a.attname AS column_name
       FROM pg_constraint con
       INNER JOIN pg_class c ON c.oid = con.conrelid
       INNER JOIN pg_namespace n ON n.oid = c.relnamespace
       INNER JOIN pg_class conf ON conf.oid = con.confrelid
       INNER JOIN pg_namespace confn ON confn.oid = conf.relnamespace
       INNER JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON true
       INNER JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = cols.attnum
      WHERE con.contype = 'f'
        AND n.nspname = 'activeclinic'
        AND confn.nspname = 'platform'
        AND conf.relname = 'organizations'`
  );
  const unexpected = [];
  for (const row of catalog.rows) {
    const tableName = String(row.table_name || "");
    const columnName = String(row.column_name || "");
    if (known.has(tableName)) continue;
    if (!IDENT_RE.test(tableName) || !IDENT_RE.test(columnName)) continue;
    const n = await countSql(
      client,
      `SELECT COUNT(*)::int AS n FROM activeclinic.${tableName} WHERE ${columnName} = $1`,
      [organizationId]
    );
    if (n > 0) {
      unexpected.push({
        table: `activeclinic.${tableName}`,
        column: columnName,
        count: n,
      });
    }
  }
  return unexpected;
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 * @param {string[]} identityIds
 */
async function classifyIdentities(client, organizationId, identityIds) {
  const deletable = [];
  const retained = [];
  for (const identityId of identityIds) {
    const otherStaff = await countSql(
      client,
      `SELECT COUNT(*)::int AS n
         FROM activeclinic.staff_members
        WHERE platform_identity_id = $1
          AND organization_id <> $2`,
      [identityId, organizationId]
    );
    const blessboardUsers = await countSql(
      client,
      `SELECT COUNT(*)::int AS n
         FROM blessboard.users
        WHERE platform_identity_id = $1`,
      [identityId]
    );
    const otherSessions = await countSql(
      client,
      `SELECT COUNT(*)::int AS n
         FROM platform.deployment_sessions
        WHERE platform_identity_id = $1
          AND organization_id IS DISTINCT FROM $2`,
      [identityId, organizationId]
    );
    if (otherStaff > 0 || blessboardUsers > 0 || otherSessions > 0) {
      retained.push({
        identityId,
        reasons: [
          otherStaff > 0 ? "other_staff" : null,
          blessboardUsers > 0 ? "blessboard_user" : null,
          otherSessions > 0 ? "other_sessions" : null,
        ].filter(Boolean),
      });
    } else {
      deletable.push(identityId);
    }
  }
  return { deletable, retained };
}

/**
 * @param {{ query: Function }} client
 * @param {string} step
 */
async function maybeFailAfter(client, step, failAfter) {
  if (failAfter && String(failAfter) === step) {
    const err = new Error(`injected_failure_after_${step}`);
    err.code = "INJECTED_FAILURE";
    throw err;
  }
}

/**
 * Caller owns the transaction.
 * @param {{ query: Function }} client
 * @param {{
 *   organizationId: string,
 *   preserveOrgIds: string[],
 *   preserveUserIds: string[],
 *   identityIds: string[],
 *   failAfter?: string|null,
 * }} opts
 */
async function deleteActiveClinicTestingOrganization(client, opts) {
  const organizationId = String(opts.organizationId || "");
  if (!UUID_RE.test(organizationId)) {
    throw new Error("invalid_organization_id");
  }

  const deleted = {};

  const review = await client.query(
    `DELETE FROM activeclinic.clinic_registration_review_events
      WHERE application_id IN (
        SELECT id FROM activeclinic.clinic_registration_applications WHERE organization_id = $1
      )`,
    [organizationId]
  );
  deleted.clinicRegistrationReviewEvents = review.rowCount || 0;

  await client.query(
    `UPDATE activeclinic.clinic_registration_applications
        SET website_instance_id = NULL,
            clinic_admin_staff_id = NULL,
            facility_id = NULL,
            healthcare_organization_id = NULL
      WHERE organization_id = $1`,
    [organizationId]
  );
  const apps = await client.query(
    `DELETE FROM activeclinic.clinic_registration_applications WHERE organization_id = $1`,
    [organizationId]
  );
  deleted.clinicRegistrationApplications = apps.rowCount || 0;

  const roleDel = await client.query(
    `DELETE FROM activeclinic.staff_role_assignments WHERE organization_id = $1`,
    [organizationId]
  );
  deleted.staffRoleAssignments = roleDel.rowCount || 0;
  const facAssign = await client.query(
    `DELETE FROM activeclinic.staff_facility_assignments WHERE organization_id = $1`,
    [organizationId]
  );
  deleted.staffFacilityAssignments = facAssign.rowCount || 0;
  const invites = await client.query(
    `DELETE FROM activeclinic.staff_invitations WHERE organization_id = $1`,
    [organizationId]
  );
  deleted.staffInvitations = invites.rowCount || 0;

  const dept = await client.query(
    `DELETE FROM activeclinic.departments WHERE organization_id = $1`,
    [organizationId]
  );
  deleted.departments = dept.rowCount || 0;
  const points = await client.query(
    `DELETE FROM activeclinic.service_points WHERE organization_id = $1`,
    [organizationId]
  );
  deleted.servicePoints = points.rowCount || 0;
  const priorities = await client.query(
    `DELETE FROM activeclinic.queue_priorities WHERE organization_id = $1`,
    [organizationId]
  );
  deleted.queuePriorities = priorities.rowCount || 0;
  const serviceTypes = await client.query(
    `DELETE FROM activeclinic.appointment_service_types WHERE organization_id = $1`,
    [organizationId]
  );
  deleted.appointmentServiceTypes = serviceTypes.rowCount || 0;

  const counters = await client.query(
    `DELETE FROM activeclinic.patient_number_counters
      WHERE healthcare_organization_id IN (
        SELECT id FROM activeclinic.healthcare_organizations WHERE organization_id = $1
      )`,
    [organizationId]
  );
  deleted.patientNumberCounters = counters.rowCount || 0;

  await client.query(
    `UPDATE activeclinic.charge_catalogue_items
        SET created_by_staff_id = NULL, updated_by_staff_id = NULL
      WHERE tenant_id = $1`,
    [organizationId]
  );
  const charges = await client.query(
    `DELETE FROM activeclinic.charge_catalogue_items WHERE tenant_id = $1`,
    [organizationId]
  );
  deleted.chargeCatalogueItems = charges.rowCount || 0;
  const meds = await client.query(
    `DELETE FROM activeclinic.medication_catalogue_items WHERE organization_id = $1`,
    [organizationId]
  );
  deleted.medicationCatalogueItems = meds.rowCount || 0;
  const procedures = await client.query(
    `DELETE FROM activeclinic.public_procedures WHERE organization_id = $1`,
    [organizationId]
  );
  deleted.publicProcedures = procedures.rowCount || 0;

  await client.query(
    `DELETE FROM platform.identity_product_profiles
      WHERE product_key = 'activeclinic'
        AND product_profile_id IN (
          SELECT id FROM activeclinic.staff_members WHERE organization_id = $1
        )`,
    [organizationId]
  );

  const staffDel = await client.query(
    `DELETE FROM activeclinic.staff_members WHERE organization_id = $1`,
    [organizationId]
  );
  deleted.staffMembers = staffDel.rowCount || 0;
  await maybeFailAfter(client, "staff_members", opts.failAfter);

  const facDel = await client.query(
    `DELETE FROM activeclinic.facilities WHERE organization_id = $1`,
    [organizationId]
  );
  deleted.facilities = facDel.rowCount || 0;

  const hcoDel = await client.query(
    `DELETE FROM activeclinic.healthcare_organizations WHERE organization_id = $1`,
    [organizationId]
  );
  deleted.healthcareOrganizations = hcoDel.rowCount || 0;
  await maybeFailAfter(client, "healthcare_organizations", opts.failAfter);

  const platformResult = await purgeOrganizationTree(client, {
    organizationId,
    preserveOrgIds: opts.preserveOrgIds || [],
    preserveUserIds: opts.preserveUserIds || [],
  });
  if (!platformResult.ok) {
    const err = new Error(platformResult.reason || "platform_purge_failed");
    err.code = "PLATFORM_PURGE_FAILED";
    err.details = platformResult;
    throw err;
  }
  deleted.organizations = 1;
  deleted.auditEvents = platformResult.auditEvents || 0;
  deleted.websiteChurches = platformResult.churches || 0;
  await maybeFailAfter(client, "platform_organizations", opts.failAfter);

  deleted.identities = 0;
  const identityIds = Array.isArray(opts.identityIds) ? opts.identityIds : [];
  if (identityIds.length) {
    await client.query(
      `DELETE FROM platform.identity_action_tokens
        WHERE platform_identity_id = ANY($1::uuid[])`,
      [identityIds]
    );
    await client.query(
      `DELETE FROM platform.identity_product_profiles
        WHERE identity_id = ANY($1::uuid[])`,
      [identityIds]
    );
    const idDel = await client.query(
      `DELETE FROM platform.identities
        WHERE id = ANY($1::uuid[])`,
      [identityIds]
    );
    deleted.identities = idDel.rowCount || 0;
  }

  return { deleted, platformResult };
}

module.exports = {
  UUID_RE,
  RESERVED_ORGANIZATION_KEYS,
  PRODUCTION_HOSTNAME_RE,
  SETUP_ORG_TABLES,
  BLOCKING_ORG_TABLES,
  BLOCKING_TENANT_TABLES,
  findOrganizationByKey,
  findOrganizationByHealthcareOrganizationId,
  listActiveProductKeys,
  listDomainHostnames,
  listPlatformAdminPreserveSet,
  loadScopedIds,
  collectCounts,
  listSharedMediaBlockers,
  listOwnedMediaStorageKeys,
  countSiblingDuplicateReferences,
  listUnexpectedActiveClinicOrgReferences,
  classifyIdentities,
  deleteActiveClinicTestingOrganization,
};
