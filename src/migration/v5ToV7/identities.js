"use strict";

const { classifyPasswordHash } = require("./passwordCompat");
const {
  normalizeEmail,
  normalizePhoneE164,
  buildIdentityIndexes,
  classifyIdentityCollision,
} = require("./identityMerge");
const { uuidFromNamespaceAndName, V5_TO_V7_NAMESPACE } = require("./idMap");

class MigrationIdentityConflictError extends Error {
  constructor(details) {
    super("migration_identity_conflict");
    this.code = "migration_identity_conflict";
    this.details = details;
  }
}

async function getInsertableColumns(pool, qualifiedName) {
  const [schema, table] = qualifiedName.split(".");
  const r = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND is_generated = 'NEVER'
      ORDER BY ordinal_position`,
    [schema, table]
  );
  return r.rows.map((row) => row.column_name);
}

/**
 * @param {import('pg').Pool} sourcePool
 * @param {string[]} orgIds
 */
async function collectBlessBoardIdentityCandidates(sourcePool, orgIds) {
  if (!orgIds.length) return [];
  const ph = orgIds.map((_, i) => `$${i + 1}`).join(", ");
  const r = await sourcePool.query(
    `SELECT DISTINCT u.id::text AS legacy_id,
            u.email_normalized AS email,
            u.phone_normalized AS phone,
            u.password_hash,
            u.display_name,
            u.status,
            EXISTS (
              SELECT 1
                FROM blessboard.user_role_assignments ura
               WHERE ura.user_id = u.id
                 AND ura.organization_id IN (${ph})
                 AND ura.status = 'active'
            ) AS required_for_v1
       FROM blessboard.users u
      WHERE u.status = 'active'
        AND u.id IN (
          SELECT DISTINCT ura.user_id
            FROM blessboard.user_role_assignments ura
           WHERE ura.organization_id IN (${ph}) AND ura.status = 'active'
        )`,
    orgIds
  );
  return r.rows.map((row) => ({
    source: "blessboard",
    legacyId: row.legacy_id,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    requiredForV1: row.required_for_v1 === true,
    sourceIdentityId: null,
    profileType: "blessboard_user",
    productKey: "blessboard",
    productProfileId: row.legacy_id,
  }));
}

/**
 * @param {import('pg').Pool} sourcePool
 * @param {string[]} hcoIds
 */
async function collectActiveClinicIdentityCandidates(sourcePool, hcoIds) {
  if (!hcoIds.length) return [];
  const ph = hcoIds.map((_, i) => `$${i + 1}`).join(", ");
  const r = await sourcePool.query(
    `SELECT DISTINCT i.id::text AS source_identity_id,
            i.email_normalized AS email,
            i.phone_normalized AS phone,
            i.password_hash,
            i.primary_email,
            i.primary_phone,
            i.status,
            sm.id::text AS staff_legacy_id,
            EXISTS (
              SELECT 1
                FROM activeclinic.staff_role_assignments sra
               WHERE sra.staff_member_id = sm.id
                 AND sra.healthcare_organization_id IN (${ph})
                 AND sra.status = 'active'
            ) AS required_for_v1
       FROM activeclinic.staff_members sm
       JOIN platform.identities i ON i.id = sm.platform_identity_id
      WHERE sm.healthcare_organization_id IN (${ph})
        AND sm.status IN ('active', 'invited')
        AND i.status = 'active'`,
    hcoIds
  );
  return r.rows.map((row) => ({
    source: "activeclinic",
    legacyId: row.staff_legacy_id,
    sourceIdentityId: row.source_identity_id,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    displayName: row.primary_email || row.email || "Staff",
    requiredForV1: row.required_for_v1 === true,
    profileType: "activeclinic_staff",
    productKey: "activeclinic",
    productProfileId: row.staff_legacy_id,
  }));
}

function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const ae = normalizeEmail(a.email);
    const be = normalizeEmail(b.email);
    if (ae !== be) return ae.localeCompare(be);
    const ap = normalizePhoneE164(a.phone);
    const bp = normalizePhoneE164(b.phone);
    if (ap !== bp) return ap.localeCompare(bp);
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return String(a.legacyId).localeCompare(String(b.legacyId));
  });
}

/**
 * @param {import('pg').PoolClient} client
 * @param {import('pg').Pool} targetPool
 * @param {object} candidate
 * @param {string} targetIdentityId
 * @param {{ dryRun: boolean }} opts
 */
async function upsertIdentityProductProfile(client, targetPool, candidate, targetIdentityId, opts) {
  if (opts.dryRun) return { inserted: 0, skipped: 0 };
  const existing = await targetPool.query(
    `SELECT id FROM platform.identity_product_profiles
      WHERE product_key = $1 AND product_profile_id = $2::uuid AND status = 'active'`,
    [candidate.productKey, candidate.productProfileId]
  );
  if (existing.rowCount) {
    await client.query(
      `UPDATE platform.identity_product_profiles
          SET identity_id = $1, updated_at = now()
        WHERE product_key = $2 AND product_profile_id = $3::uuid AND status = 'active'`,
      [targetIdentityId, candidate.productKey, candidate.productProfileId]
    );
    return { inserted: 0, skipped: 0, updated: 1 };
  }
  await client.query(
    `INSERT INTO platform.identity_product_profiles
       (identity_id, product_key, profile_type, product_profile_id, status)
     VALUES ($1, $2, $3, $4::uuid, 'active')
     ON CONFLICT DO NOTHING`,
    [targetIdentityId, candidate.productKey, candidate.profileType, candidate.productProfileId]
  );
  return { inserted: 1, updated: 0, skipped: 0 };
}

/**
 * @param {import('pg').PoolClient} client
 * @param {import('pg').Pool} targetPool
 * @param {Array<object>} candidates
 * @param {import('./idMap').createIdMap} idMap
 * @param {{ dryRun: boolean, indexes: ReturnType<typeof buildIdentityIndexes> }} opts
 */
async function migrateIdentities(client, targetPool, candidates, idMap, opts) {
  const stats = {
    sourceCount: candidates.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    conflicted: 0,
    failed: 0,
    exact_safe_match: 0,
    ambiguous_match: 0,
    no_match: 0,
    bcrypt_compatible: 0,
    password_reset_required: 0,
    conflicts: [],
  };

  const identityColumns = await getInsertableColumns(targetPool, "platform.identities");
  const sorted = sortCandidates(candidates);
  const runtimeIndex = buildIdentityIndexes([]);

  for (const row of opts.indexes.rows) {
    runtimeIndex.rows.push(row);
    const email = normalizeEmail(row.email);
    const phone = normalizePhoneE164(row.phone);
    if (email) {
      runtimeIndex.byEmail.set(email, row);
    }
    if (phone) {
      if (!runtimeIndex.byPhone.has(phone)) runtimeIndex.byPhone.set(phone, row);
    }
  }

  for (const candidate of sorted) {
    const collision = classifyIdentityCollision(runtimeIndex, candidate);

    if (collision.category === "ambiguous_match") {
      stats.ambiguous_match += 1;
      stats.conflicted += 1;
      stats.conflicts.push({
        source: candidate.source,
        legacyId: candidate.legacyId,
        reason: collision.reason,
        category: collision.category,
      });
      if (candidate.requiredForV1) {
        throw new MigrationIdentityConflictError({
          source: candidate.source,
          legacyId: candidate.legacyId,
          reason: collision.reason,
        });
      }
      continue;
    }

    let targetIdentityId = null;
    if (collision.category === "exact_safe_match") {
      targetIdentityId = collision.targetIdentityId;
      stats.exact_safe_match += 1;
    } else {
      stats.no_match += 1;
      const mapKey = candidate.sourceIdentityId || `${candidate.source}:${candidate.legacyId}`;
      targetIdentityId = idMap.resolve("identity", mapKey);
      if (!targetIdentityId && candidate.source === "activeclinic" && candidate.sourceIdentityId && !opts.dryRun) {
        const clash = await targetPool.query(`SELECT 1 FROM platform.identities WHERE id = $1::uuid`, [
          candidate.sourceIdentityId,
        ]);
        if (!clash.rowCount) targetIdentityId = candidate.sourceIdentityId;
      }
      if (!targetIdentityId) {
        targetIdentityId = opts.dryRun
          ? uuidFromNamespaceAndName(V5_TO_V7_NAMESPACE, `identity:${mapKey}`)
          : idMap.resolve("identity", mapKey, true);
      }
    }

    const hashInfo = classifyPasswordHash(candidate.passwordHash);
    if (hashInfo.migratable) stats.bcrypt_compatible += 1;
    else if (candidate.passwordHash) stats.password_reset_required += 1;

    if (!opts.dryRun) {
      const existing = await targetPool.query(`SELECT id::text FROM platform.identities WHERE id = $1::uuid`, [
        targetIdentityId,
      ]);
      const values = {
        id: targetIdentityId,
        status: "active",
        primary_email: candidate.email || null,
        email_normalized: candidate.email ? normalizeEmail(candidate.email) : null,
        primary_phone: candidate.phone || null,
        phone_normalized: candidate.phone ? normalizePhoneE164(candidate.phone) : null,
        password_hash: hashInfo.migratable ? candidate.passwordHash : null,
        must_change_password: hashInfo.migratable ? false : true,
      };
      if (existing.rowCount === 0) {
        const cols = identityColumns.filter((c) => values[c] !== undefined);
        const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
        await client.query(
          `INSERT INTO platform.identities (${cols.map((c) => `"${c}"`).join(", ")})
           VALUES (${ph})
           ON CONFLICT (id) DO NOTHING`,
          cols.map((c) => values[c])
        );
        stats.inserted += 1;
      } else {
        await client.query(
          `UPDATE platform.identities
              SET email_normalized = COALESCE($2, email_normalized),
                  primary_email = COALESCE($3, primary_email),
                  phone_normalized = COALESCE($4, phone_normalized),
                  primary_phone = COALESCE($5, primary_phone),
                  password_hash = COALESCE($6, password_hash),
                  must_change_password = CASE WHEN $6 IS NOT NULL THEN false ELSE must_change_password END,
                  updated_at = now()
            WHERE id = $1::uuid`,
          [
            targetIdentityId,
            values.email_normalized,
            values.primary_email,
            values.phone_normalized,
            values.primary_phone,
            values.password_hash,
          ]
        );
        stats.updated += 1;
      }

      if (candidate.source === "blessboard") {
        await client.query(
          `UPDATE blessboard.users SET platform_identity_id = $1::uuid WHERE id = $2::uuid`,
          [targetIdentityId, candidate.productProfileId]
        );
      }
      if (candidate.source === "activeclinic" && candidate.sourceIdentityId) {
        idMap.remember("identity", candidate.sourceIdentityId, targetIdentityId);
      }
      idMap.remember("identity", `${candidate.source}:${candidate.legacyId}`, targetIdentityId);

      await upsertIdentityProductProfile(client, targetPool, candidate, targetIdentityId, opts);
    }

    const indexRow = {
      email: candidate.email,
      phone: candidate.phone,
      source: candidate.source,
      legacyId: candidate.legacyId,
      identityId: targetIdentityId,
    };
    runtimeIndex.rows.push(indexRow);
    const email = normalizeEmail(candidate.email);
    const phone = normalizePhoneE164(candidate.phone);
    if (email) runtimeIndex.byEmail.set(email, indexRow);
    if (phone && !runtimeIndex.byPhone.has(phone)) runtimeIndex.byPhone.set(phone, indexRow);
  }

  return stats;
}

module.exports = {
  MigrationIdentityConflictError,
  collectBlessBoardIdentityCandidates,
  collectActiveClinicIdentityCandidates,
  migrateIdentities,
  sortCandidates,
};
