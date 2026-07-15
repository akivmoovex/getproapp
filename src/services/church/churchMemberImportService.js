"use strict";

/**
 * Safe member CSV import: preview, conflict review, batch-traceable commit.
 * Does not auto-merge or hard-delete people. Org/tenant IDs in CSV are ignored.
 */

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const {
  parseCsvText,
  normalizeHeader,
  mapHeader,
  classifyMemberType,
  parseAdminFlag,
  rowsToCsv,
} = require("../../church/memberImportCsv");
const { persistImportCsv, MAX_ROWS } = require("../../church/memberImportUploads");
const { getOrganisationSeatUsage } = require("./churchSeatQuotaService");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function makeBatchKey(provided) {
  const p = String(provided || "")
    .trim()
    .slice(0, 80);
  if (p) return p;
  return `imp_${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}`;
}

function maskEmail(email) {
  const e = String(email || "");
  const at = e.indexOf("@");
  if (at < 2) return "***";
  return `${e.slice(0, 1)}***${e.slice(at)}`;
}

function maskPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length < 4) return "***";
  return `***${d.slice(-4)}`;
}

async function findIdentityMatchesForBranch(pool, branchId, email, phone) {
  const emailNorm = membersRepo.normalizeEmail(email);
  const phoneNorm = membersRepo.normalizePhone(phone);
  if (!branchId || (!emailNorm && !phoneNorm)) return [];
  const r = await pool.query(
    `SELECT id, full_name, email, phone, status, organization_id, branch_id
     FROM public.church_members
     WHERE branch_id = $1
       AND (
         ($2 <> '' AND lower(trim(email)) = $2)
         OR ($3 <> '' AND phone_normalized = $3)
       )
     ORDER BY id ASC
     LIMIT 5`,
    [branchId, emailNorm, phoneNorm]
  );
  return r.rows;
}

function matchReasons(existing, emailNorm, phoneNorm) {
  const reasons = [];
  if (emailNorm && membersRepo.normalizeEmail(existing.email) === emailNorm) {
    reasons.push("email");
  }
  if (phoneNorm && membersRepo.normalizePhone(existing.phone) === phoneNorm) {
    reasons.push("phone");
  }
  return reasons;
}

function validateImportRowFields(mapped) {
  const errors = [];
  const fullName = String(mapped.full_name || "").trim();
  const email = String(mapped.email || "").trim();
  const phone = String(mapped.phone || "").trim();
  if (!fullName || fullName.length < 2) {
    errors.push("full_name_required");
  }
  if (!email || !EMAIL_RE.test(email)) {
    errors.push("email_invalid");
  }
  if (!phone || phone.replace(/\D/g, "").length < 7) {
    errors.push("phone_invalid");
  }
  const type = classifyMemberType(mapped.member_type);
  if (type.invalid) {
    errors.push("member_type_invalid");
  }
  return {
    errors,
    fullName,
    email,
    phone,
    emailNorm: membersRepo.normalizeEmail(email),
    phoneNorm: membersRepo.normalizePhone(phone),
    type,
    adminFlag: parseAdminFlag(mapped.is_admin),
  };
}

function buildImpactPreview(seatUsage, rowStatuses) {
  const memberLimit = seatUsage.memberLimit;
  const currentActive = seatUsage.activeMembers;
  let proposedVerified = 0;
  let proposedPending = 0;
  let visitorsAtLimit = 0;
  let requiringUpgrade = 0;
  let adminFlagRows = 0;
  let readyImport = 0;

  for (const row of rowStatuses) {
    if (row.admin_flag) adminFlagRows += 1;
    if (row.review_decision !== "import") continue;
    if (!["ready", "over_limit"].includes(row.disposition)) continue;
    readyImport += 1;
    if (row.proposed_status === "verified") {
      if (row.disposition === "over_limit") {
        requiringUpgrade += 1;
        proposedPending += 1;
        visitorsAtLimit += 1;
      } else {
        proposedVerified += 1;
      }
    } else {
      proposedPending += 1;
    }
  }

  const projectedActive = currentActive + proposedVerified;
  // Include over-limit member requests so Foundation preview shows how many would exceed 250.
  const unconstrainedProjected = currentActive + proposedVerified + requiringUpgrade;
  let wouldExceedBy = 0;
  if (typeof memberLimit === "number" && unconstrainedProjected > memberLimit) {
    wouldExceedBy = unconstrainedProjected - memberLimit;
  }

  return {
    packageCode: seatUsage.packageCode,
    packageLabel: seatUsage.packageLabel,
    currentActiveMembers: currentActive,
    memberLimit,
    membersDisplay: seatUsage.membersDisplay,
    proposedActiveMembers: proposedVerified,
    projectedActiveMembers: projectedActive,
    wouldExceedBy,
    visitorsImportable: proposedPending,
    visitorsThatMayStillBeImported: proposedPending,
    recordsRequiringArchiveOrGrowthUpgrade: requiringUpgrade,
    readyToImport: readyImport,
    administratorImpact: {
      currentPrivilegedAccounts: seatUsage.privilegedAccounts,
      adminLimit: seatUsage.adminLimit,
      adminsDisplay: seatUsage.adminsDisplay,
      csvAdministratorFlags: adminFlagRows,
      note:
        "CSV administrator flags are preview-only. Import never creates HQ/branch admin or ministry leader accounts.",
    },
  };
}

/**
 * Parse and preview a CSV into a durable batch (idempotent on batch_key).
 */
async function previewMemberImport(pool, opts) {
  const {
    organizationId,
    branchId,
    platformTenantId,
    adminId,
    buffer,
    originalFilename,
    batchKey: providedKey,
    actorType = "branch_admin",
  } = opts;

  const batchKey = makeBatchKey(providedKey);

  const existing = await pool.query(
    `SELECT * FROM public.church_member_import_batches
     WHERE organization_id = $1 AND branch_id = $2 AND batch_key = $3
     LIMIT 1`,
    [organizationId, branchId, batchKey]
  );
  if (existing.rows[0]) {
    return {
      outcome: "existing_batch",
      batch: existing.rows[0],
      diagnostic: await getImportBatchDetail(pool, existing.rows[0].id, {
        organizationId,
        branchId,
      }),
    };
  }

  const stored = persistImportCsv({
    organizationId,
    branchId,
    batchKey,
    originalFilename,
    buffer,
  });

  const text = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer || "");
  const parsed = parseCsvText(text);
  if (!parsed.headers.length) {
    const err = new Error("CSV is empty or missing a header row.");
    err.code = "MALFORMED_CSV";
    throw err;
  }

  const fieldMap = {};
  const ignoredTenantColumns = [];
  const unknownHeaders = [];
  parsed.headers.forEach((h, idx) => {
    const mapped = mapHeader(normalizeHeader(h));
    if (mapped.kind === "forbidden_tenant") {
      ignoredTenantColumns.push(mapped.header);
    } else if (mapped.kind === "field") {
      fieldMap[mapped.field] = idx;
    } else if (mapped.header) {
      unknownHeaders.push(mapped.header);
    }
  });

  if (fieldMap.full_name == null || fieldMap.email == null || fieldMap.phone == null) {
    const err = new Error(
      "CSV must include full_name, email, and phone columns (aliases accepted)."
    );
    err.code = "MALFORMED_CSV";
    throw err;
  }

  if (parsed.rows.length > MAX_ROWS) {
    const err = new Error(`CSV has too many rows (max ${MAX_ROWS}).`);
    err.code = "TOO_MANY_ROWS";
    throw err;
  }

  const seatUsage = await getOrganisationSeatUsage(pool, organizationId);
  if (!seatUsage) {
    const err = new Error("Organisation not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const seenEmail = new Map();
  const seenPhone = new Map();
  const prepared = [];

  for (let i = 0; i < parsed.rows.length; i += 1) {
    const cells = parsed.rows[i];
    if (!cells || cells.every((c) => String(c || "").trim() === "")) continue;

    const mapped = {};
    for (const [field, idx] of Object.entries(fieldMap)) {
      mapped[field] = cells[idx] != null ? String(cells[idx]).trim() : "";
    }

    const validation = validateImportRowFields(mapped);
    const rowNumber = i + 2; // header is row 1
    let disposition = "ready";
    let proposedStatus = validation.type.proposedStatus || "pending";
    let reviewDecision = "import";
    let matchMember = null;
    let reasons = [];
    const fieldErrors = [...validation.errors];

    if (validation.errors.length) {
      disposition = "invalid";
      reviewDecision = "skip";
    } else {
      if (validation.emailNorm && seenEmail.has(validation.emailNorm)) {
        disposition = "duplicate_in_file";
        reviewDecision = "skip";
        fieldErrors.push("duplicate_email_in_file");
      } else if (validation.phoneNorm && seenPhone.has(validation.phoneNorm)) {
        disposition = "duplicate_in_file";
        reviewDecision = "skip";
        fieldErrors.push("duplicate_phone_in_file");
      }

      if (disposition === "ready") {
        const matches = await findIdentityMatchesForBranch(
          pool,
          branchId,
          validation.email,
          validation.phone
        );
        if (matches.length) {
          matchMember = matches[0];
          reasons = matchReasons(matchMember, validation.emailNorm, validation.phoneNorm);
          if (["pending", "verified"].includes(matchMember.status)) {
            disposition = "existing_match";
            reviewDecision = "skip";
          } else {
            disposition = "conflict";
            reviewDecision = "skip";
          }
        }
      }

      if (disposition === "ready" && proposedStatus === "verified") {
        // seat impact assigned after counting — flag later
      }

      if (validation.emailNorm) seenEmail.set(validation.emailNorm, rowNumber);
      if (validation.phoneNorm) seenPhone.set(validation.phoneNorm, rowNumber);
    }

    // Optional: admin flag alone never imports accounts
    if (validation.adminFlag && disposition === "invalid" && validation.errors.every((e) => e.startsWith(""))) {
      /* keep invalid */
    }

    prepared.push({
      row_number: rowNumber,
      disposition,
      proposed_status: proposedStatus === "verified" ? "verified" : "pending",
      review_decision: reviewDecision,
      full_name: validation.fullName || mapped.full_name || "",
      email_normalized: validation.emailNorm || "",
      phone_normalized: validation.phoneNorm || "",
      phone_display: validation.phone || "",
      member_type_raw: mapped.member_type || "",
      admin_flag: validation.adminFlag,
      ignored_tenant_columns: ignoredTenantColumns,
      field_errors: fieldErrors,
      match_member_id: matchMember ? matchMember.id : null,
      match_status: matchMember ? matchMember.status : null,
      match_reasons: reasons,
      payload_json: {
        gender: mapped.gender || "",
        age_group: mapped.age_group || "",
        address_area: mapped.address_area || "",
        attendance_duration: mapped.attendance_duration || "",
        ministry_interest: mapped.ministry_interest || "",
        emergency_contact_name: mapped.emergency_contact_name || "",
        emergency_contact_phone: mapped.emergency_contact_phone || "",
        external_key: mapped.external_key || "",
        email_masked: maskEmail(validation.emailNorm || mapped.email),
        phone_masked: maskPhone(validation.phone),
      },
    });
  }

  // Apply Foundation seat over-limit to proposed verified ready rows.
  // Keep proposed_status=verified for impact preview; commit imports these as visitors.
  let verifiedSlots = 0;
  const memberLimit = seatUsage.memberLimit;
  const currentActive = seatUsage.activeMembers;
  for (const row of prepared) {
    if (row.disposition !== "ready" || row.proposed_status !== "verified") continue;
    if (typeof memberLimit === "number") {
      if (currentActive + verifiedSlots >= memberLimit) {
        row.disposition = "over_limit";
        row.field_errors = [...row.field_errors, "foundation_member_limit"];
        row.review_decision = "import";
      } else {
        verifiedSlots += 1;
      }
    } else {
      verifiedSlots += 1;
    }
  }

  const impact = buildImpactPreview(seatUsage, prepared);
  const summary = {
    rowCount: prepared.length,
    ready: prepared.filter((r) => r.disposition === "ready").length,
    invalid: prepared.filter((r) => r.disposition === "invalid").length,
    duplicateInFile: prepared.filter((r) => r.disposition === "duplicate_in_file").length,
    existingMatch: prepared.filter((r) => r.disposition === "existing_match").length,
    conflict: prepared.filter((r) => r.disposition === "conflict").length,
    overLimit: prepared.filter((r) => r.disposition === "over_limit").length,
    ignoredTenantColumns,
    unknownHeaders: unknownHeaders.slice(0, 20),
    productionMerge: false,
    productionDelete: false,
  };

  const inserted = await pool.query(
    `INSERT INTO public.church_member_import_batches (
       organization_id, branch_id, platform_tenant_id, batch_key, content_sha256,
       status, original_filename, stored_relpath, byte_size, row_count,
       summary_json, impact_json, created_by_admin_id
     ) VALUES (
       $1,$2,$3,$4,$5,
       'previewed',$6,$7,$8,$9,
       $10::jsonb,$11::jsonb,$12
     )
     ON CONFLICT (organization_id, branch_id, batch_key) DO NOTHING
     RETURNING *`,
    [
      organizationId,
      branchId,
      platformTenantId || null,
      batchKey,
      stored.contentSha256,
      String(originalFilename || "import.csv").slice(0, 180),
      stored.storedRelpath,
      stored.byteSize,
      prepared.length,
      JSON.stringify(summary),
      JSON.stringify(impact),
      adminId || null,
    ]
  );

  if (!inserted.rows[0]) {
    const again = await pool.query(
      `SELECT * FROM public.church_member_import_batches
       WHERE organization_id = $1 AND branch_id = $2 AND batch_key = $3
       LIMIT 1`,
      [organizationId, branchId, batchKey]
    );
    return {
      outcome: "existing_batch",
      batch: again.rows[0],
      diagnostic: await getImportBatchDetail(pool, again.rows[0].id, {
        organizationId,
        branchId,
      }),
    };
  }

  const batch = inserted.rows[0];
  for (const row of prepared) {
    await pool.query(
      `INSERT INTO public.church_member_import_rows (
         batch_id, row_number, disposition, proposed_status, review_decision,
         full_name, email_normalized, phone_normalized, phone_display, member_type_raw,
         admin_flag, ignored_tenant_columns, field_errors, match_member_id, match_status,
         match_reasons, payload_json
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6,$7,$8,$9,$10,
         $11,$12::jsonb,$13::jsonb,$14,$15,
         $16::jsonb,$17::jsonb
       )`,
      [
        batch.id,
        row.row_number,
        row.disposition,
        row.proposed_status,
        row.review_decision,
        row.full_name,
        row.email_normalized,
        row.phone_normalized,
        row.phone_display,
        row.member_type_raw,
        row.admin_flag,
        JSON.stringify(row.ignored_tenant_columns || []),
        JSON.stringify(row.field_errors || []),
        row.match_member_id,
        row.match_status,
        JSON.stringify(row.match_reasons || []),
        JSON.stringify(row.payload_json || {}),
      ]
    );
  }

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: branchId,
    actor_type: actorType,
    actor_id: adminId || null,
    action: "member_import_previewed",
    entity_type: "member_import_batch",
    entity_id: batch.id,
    target_label: null,
    metadata_json: {
      batch_key: batchKey,
      row_count: prepared.length,
      summary,
      // Never log raw PII / confidential row payloads
      content_sha256: stored.contentSha256,
      ignored_tenant_columns: ignoredTenantColumns,
    },
  });

  return {
    outcome: "previewed",
    batch,
    diagnostic: await getImportBatchDetail(pool, batch.id, { organizationId, branchId }),
  };
}

async function assertBatchOwned(pool, batchId, organizationId, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_member_import_batches
     WHERE id = $1 AND organization_id = $2 AND branch_id = $3
     LIMIT 1`,
    [batchId, organizationId, branchId]
  );
  return r.rows[0] || null;
}

async function getImportBatchDetail(pool, batchId, opts = {}) {
  let batch;
  if (opts.organizationId && opts.branchId) {
    batch = await assertBatchOwned(pool, batchId, opts.organizationId, opts.branchId);
  } else {
    const r = await pool.query(
      `SELECT * FROM public.church_member_import_batches WHERE id = $1 LIMIT 1`,
      [batchId]
    );
    batch = r.rows[0] || null;
  }
  if (!batch) return null;

  const rows = await pool.query(
    `SELECT id, row_number, disposition, proposed_status, review_decision,
            full_name, email_normalized, phone_normalized, phone_display, member_type_raw,
            admin_flag, ignored_tenant_columns, field_errors, match_member_id, match_status,
            match_reasons, payload_json, commit_outcome, committed_member_id
     FROM public.church_member_import_rows
     WHERE batch_id = $1
     ORDER BY row_number ASC`,
    [batchId]
  );

  const seatUsage = await getOrganisationSeatUsage(pool, batch.organization_id);
  const impact = buildImpactPreview(seatUsage, rows.rows);

  return {
    batch,
    rows: rows.rows.map((r) => ({
      ...r,
      email_masked: (r.payload_json && r.payload_json.email_masked) || maskEmail(r.email_normalized),
      phone_masked: (r.payload_json && r.payload_json.phone_masked) || maskPhone(r.phone_display),
    })),
    impact,
    summary: batch.summary_json || {},
  };
}

async function updateImportRowDecisions(pool, opts) {
  const { batchId, organizationId, branchId, decisions } = opts;
  const batch = await assertBatchOwned(pool, batchId, organizationId, branchId);
  if (!batch) {
    const err = new Error("Import batch not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (batch.status !== "previewed") {
    const err = new Error("Only previewed batches can be updated.");
    err.code = "INVALID_STATUS";
    throw err;
  }

  for (const d of decisions || []) {
    const rowId = Number(d.rowId);
    const decision = d.decision === "import" ? "import" : "skip";
    if (!Number.isFinite(rowId) || rowId <= 0) continue;
    await pool.query(
      `UPDATE public.church_member_import_rows
       SET review_decision = $3, updated_at = now()
       WHERE id = $1 AND batch_id = $2
         AND disposition IN ('ready', 'over_limit')`,
      [rowId, batchId, decision]
    );
  }

  const detail = await getImportBatchDetail(pool, batchId, { organizationId, branchId });
  await pool.query(
    `UPDATE public.church_member_import_batches
     SET impact_json = $2::jsonb, updated_at = now()
     WHERE id = $1`,
    [batchId, JSON.stringify(detail.impact)]
  );
  return detail;
}

async function createMemberFromImportRow(pool, batch, row, passwordHash) {
  const payload = row.payload_json || {};
  const r = await pool.query(
    `INSERT INTO public.church_members (
       organization_id, branch_id, platform_tenant_id,
       email, phone, phone_normalized, full_name, password_hash,
       gender, age_group, address_area, attendance_duration, ministry_interest,
       emergency_contact_name, emergency_contact_phone, status, import_batch_id
     ) VALUES (
       $1,$2,$3,
       $4,$5,$6,$7,$8,
       $9,$10,$11,$12,$13,
       $14,$15,'pending',$16
     )
     RETURNING *`,
    [
      batch.organization_id,
      batch.branch_id,
      batch.platform_tenant_id,
      row.email_normalized,
      String(row.phone_display || "").slice(0, 64),
      row.phone_normalized,
      String(row.full_name || "").slice(0, 200),
      passwordHash,
      String(payload.gender || "").slice(0, 32),
      String(payload.age_group || "").slice(0, 64),
      String(payload.address_area || "").slice(0, 300),
      String(payload.attendance_duration || "").slice(0, 64),
      String(payload.ministry_interest || "").slice(0, 500),
      String(payload.emergency_contact_name || "").slice(0, 200),
      String(payload.emergency_contact_phone || "").slice(0, 64),
      batch.id,
    ]
  );
  return r.rows[0];
}

/**
 * Commit import rows. Idempotent if batch already committed.
 * Existing matches are never merged. Over-limit member rows import as visitors.
 */
async function commitMemberImport(pool, opts) {
  const { batchId, organizationId, branchId, adminId, actorType = "branch_admin" } = opts;
  const batch = await assertBatchOwned(pool, batchId, organizationId, branchId);
  if (!batch) {
    const err = new Error("Import batch not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (batch.status === "committed") {
    return {
      outcome: "already_committed",
      diagnostic: await getImportBatchDetail(pool, batchId, { organizationId, branchId }),
    };
  }
  if (batch.status === "reversed") {
    const err = new Error("This import batch was reversed and cannot be committed again.");
    err.code = "INVALID_STATUS";
    throw err;
  }
  if (batch.status !== "previewed") {
    const err = new Error("Only previewed batches can be committed.");
    err.code = "INVALID_STATUS";
    throw err;
  }

  const detail = await getImportBatchDetail(pool, batchId, { organizationId, branchId });
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12);

  let created = 0;
  let verified = 0;
  let asVisitor = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of detail.rows) {
    if (row.review_decision !== "import") {
      skipped += 1;
      await pool.query(
        `UPDATE public.church_member_import_rows
         SET commit_outcome = 'skipped', updated_at = now() WHERE id = $1`,
        [row.id]
      );
      continue;
    }
    if (!["ready", "over_limit"].includes(row.disposition)) {
      skipped += 1;
      await pool.query(
        `UPDATE public.church_member_import_rows
         SET commit_outcome = 'skipped_not_ready', updated_at = now() WHERE id = $1`,
        [row.id]
      );
      continue;
    }

    try {
      // Re-check identity — never merge
      const conflict = await membersRepo.findActiveRegistrationConflictForBranch(
        pool,
        branchId,
        row.email_normalized,
        row.phone_display || row.phone_normalized
      );
      if (conflict) {
        skipped += 1;
        await pool.query(
          `UPDATE public.church_member_import_rows
           SET commit_outcome = 'skipped_existing', disposition = 'existing_match',
               match_member_id = $2, updated_at = now()
           WHERE id = $1`,
          [row.id, conflict.id]
        );
        continue;
      }

      const member = await createMemberFromImportRow(pool, batch, row, passwordHash);
      created += 1;
      let outcome = "created_pending";
      let finalStatus = "pending";

      const wantVerified =
        row.disposition === "ready" && row.proposed_status === "verified";
      // over_limit rows commit as visitors (pending) — seats blocked for verified
      if (wantVerified) {
        try {
          const verifiedRow = await membersRepo.verifyMemberForBranch(
            pool,
            member.id,
            branchId,
            adminId
          );
          if (verifiedRow && verifiedRow.status === "verified") {
            verified += 1;
            outcome = "created_verified";
            finalStatus = "verified";
          } else {
            asVisitor += 1;
            outcome = "created_pending_verify_unavailable";
          }
        } catch (verifyErr) {
          if (verifyErr && verifyErr.code === "FOUNDATION_MEMBER_LIMIT") {
            asVisitor += 1;
            outcome = "created_pending_over_limit";
          } else {
            throw verifyErr;
          }
        }
      } else {
        asVisitor += 1;
      }

      await pool.query(
        `UPDATE public.church_member_import_rows
         SET commit_outcome = $2, committed_member_id = $3, updated_at = now()
         WHERE id = $1`,
        [row.id, outcome, member.id]
      );

      await auditLogsRepo.insertAuditLog(pool, {
        organization_id: organizationId,
        branch_id: branchId,
        actor_type: actorType,
        actor_id: adminId || null,
        action: "member_imported",
        entity_type: "member",
        entity_id: member.id,
        target_label: null,
        metadata_json: {
          batch_id: batchId,
          row_number: row.row_number,
          status: finalStatus,
          // No raw PII in audit
        },
      });
    } catch (err) {
      failed += 1;
      await pool.query(
        `UPDATE public.church_member_import_rows
         SET commit_outcome = $2, updated_at = now() WHERE id = $1`,
        [row.id, `failed:${String(err && err.code ? err.code : "error").slice(0, 40)}`]
      );
    }
  }

  const commitSummary = {
    created,
    verified,
    as_visitor_or_pending: asVisitor,
    skipped,
    failed,
  };

  await pool.query(
    `UPDATE public.church_member_import_batches
     SET status = 'committed',
         committed_at = now(),
         committed_by_admin_id = $2,
         summary_json = COALESCE(summary_json, '{}'::jsonb) || $3::jsonb,
         updated_at = now()
     WHERE id = $1 AND status = 'previewed'`,
    [batchId, adminId || null, JSON.stringify({ commit: commitSummary })]
  );

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: branchId,
    actor_type: actorType,
    actor_id: adminId || null,
    action: "member_import_committed",
    entity_type: "member_import_batch",
    entity_id: batchId,
    target_label: null,
    metadata_json: {
      batch_key: batch.batch_key,
      commit: commitSummary,
    },
  });

  return {
    outcome: "committed",
    commitSummary,
    diagnostic: await getImportBatchDetail(pool, batchId, { organizationId, branchId }),
  };
}

/**
 * Reverse a committed batch by suspending members created by that batch.
 * Does not hard-delete. Idempotent if already reversed.
 */
async function reverseMemberImportBatch(pool, opts) {
  const { batchId, organizationId, branchId, adminId, actorType = "branch_admin", reason } = opts;
  const batch = await assertBatchOwned(pool, batchId, organizationId, branchId);
  if (!batch) {
    const err = new Error("Import batch not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (batch.status === "reversed") {
    return {
      outcome: "already_reversed",
      diagnostic: await getImportBatchDetail(pool, batchId, { organizationId, branchId }),
    };
  }
  if (batch.status !== "committed") {
    const err = new Error("Only committed import batches can be reversed.");
    err.code = "INVALID_STATUS";
    throw err;
  }

  const reasonText = String(reason || "Import batch reversed by administrator.").slice(0, 2000);
  const r = await pool.query(
    `UPDATE public.church_members
     SET status = 'suspended',
         suspended_at = now(),
         suspended_by_admin_id = $2,
         review_comment = $3,
         updated_at = now()
     WHERE import_batch_id = $1
       AND organization_id = $4
       AND branch_id = $5
       AND status IN ('pending', 'verified')
     RETURNING id`,
    [batchId, adminId || null, reasonText, organizationId, branchId]
  );

  await pool.query(
    `UPDATE public.church_member_import_batches
     SET status = 'reversed', reversed_at = now(), reversed_by_admin_id = $2, updated_at = now()
     WHERE id = $1 AND status = 'committed'`,
    [batchId, adminId || null]
  );

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: branchId,
    actor_type: actorType,
    actor_id: adminId || null,
    action: "member_import_reversed",
    entity_type: "member_import_batch",
    entity_id: batchId,
    target_label: null,
    metadata_json: {
      batch_key: batch.batch_key,
      suspended_count: r.rows.length,
      // No member PII
    },
  });

  return {
    outcome: "reversed",
    suspendedCount: r.rows.length,
    diagnostic: await getImportBatchDetail(pool, batchId, { organizationId, branchId }),
  };
}

async function listImportBatchesForBranch(pool, organizationId, branchId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 25, 1), 100);
  const r = await pool.query(
    `SELECT id, batch_key, status, original_filename, row_count, summary_json, impact_json,
            created_at, committed_at, reversed_at
     FROM public.church_member_import_batches
     WHERE organization_id = $1 AND branch_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [organizationId, branchId, limit]
  );
  return r.rows;
}

function buildErrorExportCsv(detail) {
  const headers = [
    "row_number",
    "disposition",
    "review_decision",
    "full_name",
    "email_masked",
    "phone_masked",
    "errors",
    "match_member_id",
    "match_status",
  ];
  const dataRows = (detail.rows || [])
    .filter((r) => r.disposition !== "ready" || (r.field_errors && r.field_errors.length))
    .map((r) => ({
      row_number: r.row_number,
      disposition: r.disposition,
      review_decision: r.review_decision,
      full_name: r.full_name || "",
      email_masked: r.email_masked || "",
      phone_masked: r.phone_masked || "",
      errors: Array.isArray(r.field_errors) ? r.field_errors.join("|") : "",
      match_member_id: r.match_member_id || "",
      match_status: r.match_status || "",
    }));
  return rowsToCsv(headers, dataRows);
}

module.exports = {
  previewMemberImport,
  getImportBatchDetail,
  updateImportRowDecisions,
  commitMemberImport,
  reverseMemberImportBatch,
  listImportBatchesForBranch,
  buildErrorExportCsv,
  buildImpactPreview,
  makeBatchKey,
  findIdentityMatchesForBranch,
  validateImportRowFields,
  maskEmail,
  maskPhone,
};
