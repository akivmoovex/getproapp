"use strict";

/**
 * SQL repository for BlessBoard V5 public website content tables.
 * Callers own transactions; no business publishing rules here beyond SQL.
 */

function mapPage(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    pageKey: row.page_key,
    title: row.title,
    status: row.status,
    publishedAt: row.published_at,
    layoutMetadata: row.layout_metadata,
    revisionNumber: row.revision_number != null ? Number(row.revision_number) : 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSection(row) {
  if (!row) return null;
  return {
    id: row.id,
    pageId: row.page_id,
    sectionKey: row.section_key,
    sectionType: row.section_type,
    heading: row.heading,
    bodyText: row.body_text,
    mediaUrl: row.media_url,
    sortOrder: row.sort_order,
    status: row.status,
    layoutMetadata: row.layout_metadata,
    revisionNumber: row.revision_number != null ? Number(row.revision_number) : 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLeader(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    displayName: row.display_name,
    roleTitle: row.role_title,
    biography: row.biography,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMinistry(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    name: row.name,
    summary: row.summary,
    description: row.description,
    meetingDay: row.meeting_day,
    contactEmail: row.contact_email,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    status: row.status,
    joinPolicy: row.join_policy || "request",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    title: row.title,
    summary: row.summary,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    location: row.location,
    registrationUrl: row.registration_url,
    imageUrl: row.image_url,
    capacity: row.capacity == null ? null : Number(row.capacity),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSermon(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    title: row.title,
    speakerName: row.speaker_name,
    preachedAt: row.preached_at,
    summary: row.summary,
    mediaUrl: row.media_url,
    resourceUrl: row.resource_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContactChannel(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    channelType: row.channel_type,
    label: row.label,
    value: row.value,
    sortOrder: row.sort_order,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGivingMethod(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    methodType: row.method_type,
    label: row.label,
    description: row.description != null ? row.description : null,
    accountDetails: row.account_details != null ? row.account_details : null,
    instructions: row.instructions,
    externalUrl: row.external_url,
    buttonLabel: row.button_label != null ? row.button_label : null,
    qrImageUrl: row.qr_image_url != null ? row.qr_image_url : null,
    sortOrder: row.sort_order,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Core page/section columns for provision + reads.
 * Intentionally omit revision_number so Foundation provisioning works when
 * migration 043 (website revision columns) is not yet applied. mapPage/mapSection
 * default revisionNumber to 1 when the column is absent from the row.
 * Update paths that bump revision_number use *_WITH_REVISION below.
 */
const PAGE_COLS = `id, church_id, branch_id, page_key, title, status, published_at,
                   layout_metadata, created_at, updated_at`;
const SECTION_COLS = `id, page_id, section_key, section_type, heading, body_text, media_url,
                      sort_order, status, layout_metadata, created_at, updated_at`;
const PAGE_COLS_WITH_REVISION = `id, church_id, branch_id, page_key, title, status, published_at,
                   layout_metadata, revision_number, created_at, updated_at`;
const SECTION_COLS_WITH_REVISION = `id, page_id, section_key, section_type, heading, body_text, media_url,
                      sort_order, status, layout_metadata, revision_number, created_at, updated_at`;
const LEADER_COLS = `id, church_id, branch_id, display_name, role_title, biography, image_url,
                     sort_order, status, created_at, updated_at`;
const MINISTRY_COLS = `id, church_id, branch_id, name, summary, description, meeting_day,
                       contact_email, image_url, sort_order, status, join_policy, created_at, updated_at`;
const EVENT_COLS = `id, church_id, branch_id, title, summary, starts_at, ends_at, timezone,
                    location, registration_url, image_url, capacity, status, created_at, updated_at`;
const SERMON_COLS = `id, church_id, branch_id, title, speaker_name, preached_at, summary,
                     media_url, resource_url, status, created_at, updated_at`;
const CONTACT_COLS = `id, church_id, branch_id, channel_type, label, value, sort_order,
                      status, created_at, updated_at`;
const GIVING_COLS = `id, church_id, branch_id, method_type, label, description, account_details,
                     instructions, external_url, button_label, qr_image_url,
                     sort_order, status, created_at, updated_at`;

/**
 * @param {{ query: Function }} client
 * @param {{ churchId: string, branchId: string|null, pageKey: string }} scope
 */
async function findPageByScope(client, scope) {
  const r = scope.branchId
    ? await client.query(
        `SELECT ${PAGE_COLS_WITH_REVISION}
           FROM blessboard.public_pages
          WHERE church_id = $1 AND branch_id = $2 AND page_key = $3
          LIMIT 1`,
        [scope.churchId, scope.branchId, scope.pageKey]
      )
    : await client.query(
        `SELECT ${PAGE_COLS_WITH_REVISION}
           FROM blessboard.public_pages
          WHERE church_id = $1 AND branch_id IS NULL AND page_key = $2
          LIMIT 1`,
        [scope.churchId, scope.pageKey]
      );
  return mapPage(r.rows[0] || null);
}

/**
 * Scope lookup without revision_number — used by Foundation provision when
 * website revision migrations may not yet be applied.
 * @param {{ query: Function }} client
 * @param {{ churchId: string, branchId: string|null, pageKey: string }} scope
 */
async function findPageByScopeForProvision(client, scope) {
  const r = scope.branchId
    ? await client.query(
        `SELECT ${PAGE_COLS}
           FROM blessboard.public_pages
          WHERE church_id = $1 AND branch_id = $2 AND page_key = $3
          LIMIT 1`,
        [scope.churchId, scope.branchId, scope.pageKey]
      )
    : await client.query(
        `SELECT ${PAGE_COLS}
           FROM blessboard.public_pages
          WHERE church_id = $1 AND branch_id IS NULL AND page_key = $2
          LIMIT 1`,
        [scope.churchId, scope.pageKey]
      );
  return mapPage(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} pageId
 */
async function findPageById(client, pageId) {
  const r = await client.query(
    `SELECT ${PAGE_COLS_WITH_REVISION} FROM blessboard.public_pages WHERE id = $1 LIMIT 1`,
    [pageId]
  );
  return mapPage(r.rows[0] || null);
}

/**
 * Idempotent empty draft page insert.
 * @param {{ query: Function }} client
 * @param {{ churchId: string, branchId: string|null, pageKey: string, title: string }} fields
 */
async function ensureDraftPage(client, fields) {
  const sql = fields.branchId
    ? `INSERT INTO blessboard.public_pages
         (church_id, branch_id, page_key, title, status)
       VALUES ($1, $2, $3, $4, 'draft')
       ON CONFLICT (church_id, branch_id, page_key) WHERE branch_id IS NOT NULL
       DO NOTHING
       RETURNING ${PAGE_COLS}`
    : `INSERT INTO blessboard.public_pages
         (church_id, branch_id, page_key, title, status)
       VALUES ($1, NULL, $2, $3, 'draft')
       ON CONFLICT (church_id, page_key) WHERE branch_id IS NULL
       DO NOTHING
       RETURNING ${PAGE_COLS}`;
  const params = fields.branchId
    ? [fields.churchId, fields.branchId, fields.pageKey, fields.title]
    : [fields.churchId, fields.pageKey, fields.title];
  const r = await client.query(sql, params);
  if (r.rows[0]) return { page: mapPage(r.rows[0]), created: true };
  const existing = await findPageByScopeForProvision(client, fields);
  return { page: existing, created: false };
}

/**
 * @param {{ query: Function }} client
 * @param {string} pageId
 * @param {{ title?: string, status?: string, publishedAt?: Date|string|null, layoutMetadata?: object|null, expectedUpdatedAt?: Date|string|null }} patch
 * @returns {Promise<{ page: object|null, conflict: boolean }>}
 */
async function updatePage(client, pageId, patch) {
  const params = [
    pageId,
    patch.title != null ? patch.title : null,
    patch.status != null ? patch.status : null,
    patch.publishedAt !== undefined ? patch.publishedAt : null,
    patch.layoutMetadata !== undefined ? patch.layoutMetadata : null,
  ];
  let where = "id = $1";
  if (patch.expectedRevision != null && Number.isFinite(Number(patch.expectedRevision))) {
    params.push(Number(patch.expectedRevision));
    where += ` AND revision_number = $${params.length}`;
  } else if (patch.expectedUpdatedAt != null) {
    params.push(patch.expectedUpdatedAt);
    where += ` AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $${params.length}::timestamptz)`;
  }
  const r = await client.query(
    `UPDATE blessboard.public_pages
        SET title = COALESCE($2, title),
            status = COALESCE($3, status),
            published_at = CASE
              WHEN $3 = 'published' THEN COALESCE($4, published_at, now())
              WHEN $3 IS NOT NULL THEN $4
              ELSE published_at
            END,
            layout_metadata = COALESCE($5, layout_metadata),
            revision_number = revision_number + 1,
            updated_at = now()
      WHERE ${where}
      RETURNING ${PAGE_COLS_WITH_REVISION}`,
    params
  );
  if (r.rows[0]) return { page: mapPage(r.rows[0]), conflict: false };
  if (patch.expectedRevision != null || patch.expectedUpdatedAt != null) {
    const existing = await findPageById(client, pageId);
    if (existing) return { page: null, conflict: true };
  }
  return { page: null, conflict: false };
}

/**
 * @param {{ query: Function }} client
 * @param {string} pageId
 * @param {{ status?: string|null }} [opts]
 */
async function listSectionsForPage(client, pageId, opts = {}) {
  const params = [pageId];
  let statusClause = "";
  if (opts.status) {
    params.push(opts.status);
    statusClause = ` AND status = $${params.length}`;
  }
  const r = await client.query(
    `SELECT ${SECTION_COLS_WITH_REVISION}
       FROM blessboard.page_sections
      WHERE page_id = $1${statusClause}
      ORDER BY sort_order ASC, created_at ASC`,
    params
  );
  return r.rows.map(mapSection);
}

/**
 * @param {{ query: Function }} client
 * @param {object} fields
 */
async function insertSection(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.page_sections
       (page_id, section_key, section_type, heading, body_text, media_url,
        sort_order, status, layout_metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${SECTION_COLS}`,
    [
      fields.pageId,
      fields.sectionKey,
      fields.sectionType,
      fields.heading,
      fields.bodyText,
      fields.mediaUrl,
      fields.sortOrder != null ? fields.sortOrder : 0,
      fields.status || "draft",
      fields.layoutMetadata != null ? fields.layoutMetadata : null,
    ]
  );
  return mapSection(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} sectionId
 * @param {object} patch
 * @returns {Promise<{ section: object|null, conflict: boolean }>}
 */
async function updateSection(client, sectionId, patch) {
  const params = [
    sectionId,
    patch.sectionType != null ? patch.sectionType : null,
    patch.heading !== undefined ? patch.heading : null,
    patch.bodyText !== undefined ? patch.bodyText : null,
    patch.mediaUrl !== undefined ? patch.mediaUrl : null,
    patch.sortOrder != null ? patch.sortOrder : null,
    patch.status != null ? patch.status : null,
    patch.layoutMetadata !== undefined ? patch.layoutMetadata : null,
  ];
  let where = "id = $1";
  if (patch.expectedRevision != null && Number.isFinite(Number(patch.expectedRevision))) {
    params.push(Number(patch.expectedRevision));
    where += ` AND revision_number = $${params.length}`;
  } else if (patch.expectedUpdatedAt != null) {
    params.push(patch.expectedUpdatedAt);
    where += ` AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $${params.length}::timestamptz)`;
  }
  const r = await client.query(
    `UPDATE blessboard.page_sections
        SET section_type = COALESCE($2, section_type),
            heading = COALESCE($3, heading),
            body_text = COALESCE($4, body_text),
            media_url = COALESCE($5, media_url),
            sort_order = COALESCE($6, sort_order),
            status = COALESCE($7, status),
            layout_metadata = COALESCE($8, layout_metadata),
            revision_number = revision_number + 1,
            updated_at = now()
      WHERE ${where}
      RETURNING ${SECTION_COLS_WITH_REVISION}`,
    params
  );
  if (r.rows[0]) return { section: mapSection(r.rows[0]), conflict: false };
  if (patch.expectedRevision != null || patch.expectedUpdatedAt != null) {
    const existing = await findSectionById(client, sectionId);
    if (existing) return { section: null, conflict: true };
  }
  return { section: null, conflict: false };
}

/**
 * @param {{ query: Function }} client
 * @param {string} pageId
 * @param {string} sectionKey
 */
async function findSectionByPageAndKey(client, pageId, sectionKey) {
  const r = await client.query(
    `SELECT ${SECTION_COLS_WITH_REVISION}
       FROM blessboard.page_sections
      WHERE page_id = $1 AND section_key = $2
      LIMIT 1`,
    [pageId, sectionKey]
  );
  return mapSection(r.rows[0] || null);
}

/**
 * Section lookup without revision_number — Foundation provision / service-times seed.
 * @param {{ query: Function }} client
 * @param {string} pageId
 * @param {string} sectionKey
 */
async function findSectionByPageAndKeyForProvision(client, pageId, sectionKey) {
  const r = await client.query(
    `SELECT ${SECTION_COLS}
       FROM blessboard.page_sections
      WHERE page_id = $1 AND section_key = $2
      LIMIT 1`,
    [pageId, sectionKey]
  );
  return mapSection(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} sectionId
 */
async function findSectionById(client, sectionId) {
  const r = await client.query(
    `SELECT ${SECTION_COLS_WITH_REVISION} FROM blessboard.page_sections WHERE id = $1 LIMIT 1`,
    [sectionId]
  );
  return mapSection(r.rows[0] || null);
}

/**
 * Scoped list helper for church/branch content tables.
 * @param {{ query: Function }} client
 * @param {string} table
 * @param {string} columns
 * @param {Function} mapper
 * @param {{ churchId: string, branchId?: string|null, status?: string|null, orderBy: string }} opts
 */
async function listScopedContent(client, table, columns, mapper, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1`;
  if (opts.branchId === null) {
    where += ` AND branch_id IS NULL`;
  } else if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  if (opts.status) {
    params.push(opts.status);
    where += ` AND status = $${params.length}`;
  }
  const r = await client.query(
    `SELECT ${columns}
       FROM blessboard.${table}
      WHERE ${where}
      ORDER BY ${opts.orderBy}`,
    params
  );
  return r.rows.map(mapper);
}

async function listLeaders(client, opts) {
  return listScopedContent(client, "leaders", LEADER_COLS, mapLeader, {
    ...opts,
    orderBy: "sort_order ASC, created_at ASC",
  });
}

async function listMinistries(client, opts) {
  return listScopedContent(client, "ministries", MINISTRY_COLS, mapMinistry, {
    ...opts,
    orderBy: "sort_order ASC, created_at ASC",
  });
}

async function listEvents(client, opts) {
  return listScopedContent(client, "events", EVENT_COLS, mapEvent, {
    ...opts,
    orderBy: "starts_at DESC, created_at DESC",
  });
}

async function listSermons(client, opts) {
  return listScopedContent(client, "sermons", SERMON_COLS, mapSermon, {
    ...opts,
    orderBy: "preached_at DESC, created_at DESC",
  });
}

async function listContactChannels(client, opts) {
  return listScopedContent(client, "contact_channels", CONTACT_COLS, mapContactChannel, {
    ...opts,
    orderBy: "sort_order ASC, created_at ASC",
  });
}

async function listGivingMethods(client, opts) {
  return listScopedContent(client, "giving_methods", GIVING_COLS, mapGivingMethod, {
    ...opts,
    orderBy: "sort_order ASC, created_at ASC",
  });
}

async function insertLeader(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.leaders
       (church_id, branch_id, display_name, role_title, biography, image_url, sort_order, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${LEADER_COLS}`,
    [
      fields.churchId,
      fields.branchId,
      fields.displayName,
      fields.roleTitle,
      fields.biography,
      fields.imageUrl,
      fields.sortOrder != null ? fields.sortOrder : 0,
      fields.status || "draft",
    ]
  );
  return mapLeader(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   table: string,
 *   columns: string,
 *   id: string,
 *   setClause: string,
 *   values: unknown[],
 *   findById: Function,
 *   mapper: Function,
 *   expectedUpdatedAt?: Date|string|null,
 * }} opts
 */
async function optimisticUpdateRow(client, opts) {
  const params = [opts.id, ...opts.values];
  let where = "id = $1";
  if (opts.expectedUpdatedAt != null) {
    params.push(opts.expectedUpdatedAt);
    where += ` AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $${params.length}::timestamptz)`;
  }
  const r = await client.query(
    `UPDATE blessboard.${opts.table}
        SET ${opts.setClause},
            updated_at = now()
      WHERE ${where}
      RETURNING ${opts.columns}`,
    params
  );
  if (r.rows[0]) return { item: opts.mapper(r.rows[0]), conflict: false };
  if (opts.expectedUpdatedAt != null) {
    const existing = await opts.findById(client, opts.id);
    if (existing) return { item: null, conflict: true };
  }
  return { item: null, conflict: false };
}

async function updateLeader(client, id, patch) {
  return optimisticUpdateRow(client, {
    table: "leaders",
    columns: LEADER_COLS,
    id,
    setClause: `display_name = COALESCE($2, display_name),
            role_title = COALESCE($3, role_title),
            biography = COALESCE($4, biography),
            image_url = COALESCE($5, image_url),
            sort_order = COALESCE($6, sort_order),
            status = COALESCE($7, status)`,
    values: [
      patch.displayName != null ? patch.displayName : null,
      patch.roleTitle != null ? patch.roleTitle : null,
      patch.biography !== undefined ? patch.biography : null,
      patch.imageUrl !== undefined ? patch.imageUrl : null,
      patch.sortOrder != null ? patch.sortOrder : null,
      patch.status != null ? patch.status : null,
    ],
    findById: findLeaderById,
    mapper: mapLeader,
    expectedUpdatedAt: patch.expectedUpdatedAt,
  });
}

async function findLeaderById(client, id) {
  const r = await client.query(
    `SELECT ${LEADER_COLS} FROM blessboard.leaders WHERE id = $1 LIMIT 1`,
    [id]
  );
  return mapLeader(r.rows[0] || null);
}

async function insertMinistry(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.ministries
       (church_id, branch_id, name, summary, description, meeting_day, contact_email,
        image_url, sort_order, status, join_policy)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${MINISTRY_COLS}`,
    [
      fields.churchId,
      fields.branchId,
      fields.name,
      fields.summary,
      fields.description,
      fields.meetingDay,
      fields.contactEmail,
      fields.imageUrl,
      fields.sortOrder != null ? fields.sortOrder : 0,
      fields.status || "draft",
      fields.joinPolicy || "request",
    ]
  );
  return mapMinistry(r.rows[0] || null);
}

async function updateMinistry(client, id, patch) {
  return optimisticUpdateRow(client, {
    table: "ministries",
    columns: MINISTRY_COLS,
    id,
    setClause: `name = COALESCE($2, name),
            summary = COALESCE($3, summary),
            description = COALESCE($4, description),
            meeting_day = COALESCE($5, meeting_day),
            contact_email = COALESCE($6, contact_email),
            image_url = COALESCE($7, image_url),
            sort_order = COALESCE($8, sort_order),
            status = COALESCE($9, status),
            join_policy = COALESCE($10, join_policy)`,
    values: [
      patch.name != null ? patch.name : null,
      patch.summary !== undefined ? patch.summary : null,
      patch.description !== undefined ? patch.description : null,
      patch.meetingDay !== undefined ? patch.meetingDay : null,
      patch.contactEmail !== undefined ? patch.contactEmail : null,
      patch.imageUrl !== undefined ? patch.imageUrl : null,
      patch.sortOrder != null ? patch.sortOrder : null,
      patch.status != null ? patch.status : null,
      patch.joinPolicy != null ? patch.joinPolicy : null,
    ],
    findById: findMinistryById,
    mapper: mapMinistry,
    expectedUpdatedAt: patch.expectedUpdatedAt,
  });
}

async function findMinistryById(client, id) {
  const r = await client.query(
    `SELECT ${MINISTRY_COLS} FROM blessboard.ministries WHERE id = $1 LIMIT 1`,
    [id]
  );
  return mapMinistry(r.rows[0] || null);
}

async function insertEvent(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.events
       (church_id, branch_id, title, summary, starts_at, ends_at, timezone,
        location, registration_url, image_url, capacity, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING ${EVENT_COLS}`,
    [
      fields.churchId,
      fields.branchId,
      fields.title,
      fields.summary,
      fields.startsAt,
      fields.endsAt,
      fields.timezone,
      fields.location,
      fields.registrationUrl,
      fields.imageUrl,
      fields.capacity != null ? fields.capacity : null,
      fields.status || "draft",
    ]
  );
  return mapEvent(r.rows[0] || null);
}

async function updateEvent(client, id, patch) {
  return optimisticUpdateRow(client, {
    table: "events",
    columns: EVENT_COLS,
    id,
    setClause: `title = COALESCE($2, title),
            summary = COALESCE($3, summary),
            starts_at = COALESCE($4, starts_at),
            ends_at = COALESCE($5, ends_at),
            timezone = COALESCE($6, timezone),
            location = COALESCE($7, location),
            registration_url = COALESCE($8, registration_url),
            image_url = COALESCE($9, image_url),
            capacity = CASE
              WHEN $11::boolean THEN NULL
              WHEN $10::int IS NOT NULL THEN $10::int
              ELSE capacity
            END,
            status = COALESCE($12, status)`,
    values: [
      patch.title != null ? patch.title : null,
      patch.summary !== undefined ? patch.summary : null,
      patch.startsAt != null ? patch.startsAt : null,
      patch.endsAt !== undefined ? patch.endsAt : null,
      patch.timezone != null ? patch.timezone : null,
      patch.location !== undefined ? patch.location : null,
      patch.registrationUrl !== undefined ? patch.registrationUrl : null,
      patch.imageUrl !== undefined ? patch.imageUrl : null,
      patch.capacity != null ? patch.capacity : null,
      patch.clearCapacity === true,
      patch.status != null ? patch.status : null,
    ],
    findById: findEventById,
    mapper: mapEvent,
    expectedUpdatedAt: patch.expectedUpdatedAt,
  });
}

async function findEventById(client, id) {
  const r = await client.query(
    `SELECT ${EVENT_COLS} FROM blessboard.events WHERE id = $1 LIMIT 1`,
    [id]
  );
  return mapEvent(r.rows[0] || null);
}

async function insertSermon(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.sermons
       (church_id, branch_id, title, speaker_name, preached_at, summary,
        media_url, resource_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${SERMON_COLS}`,
    [
      fields.churchId,
      fields.branchId,
      fields.title,
      fields.speakerName,
      fields.preachedAt,
      fields.summary,
      fields.mediaUrl,
      fields.resourceUrl,
      fields.status || "draft",
    ]
  );
  return mapSermon(r.rows[0] || null);
}

async function updateSermon(client, id, patch) {
  return optimisticUpdateRow(client, {
    table: "sermons",
    columns: SERMON_COLS,
    id,
    setClause: `title = COALESCE($2, title),
            speaker_name = COALESCE($3, speaker_name),
            preached_at = COALESCE($4, preached_at),
            summary = COALESCE($5, summary),
            media_url = COALESCE($6, media_url),
            resource_url = COALESCE($7, resource_url),
            status = COALESCE($8, status)`,
    values: [
      patch.title != null ? patch.title : null,
      patch.speakerName != null ? patch.speakerName : null,
      patch.preachedAt != null ? patch.preachedAt : null,
      patch.summary !== undefined ? patch.summary : null,
      patch.mediaUrl !== undefined ? patch.mediaUrl : null,
      patch.resourceUrl !== undefined ? patch.resourceUrl : null,
      patch.status != null ? patch.status : null,
    ],
    findById: findSermonById,
    mapper: mapSermon,
    expectedUpdatedAt: patch.expectedUpdatedAt,
  });
}

async function findSermonById(client, id) {
  const r = await client.query(
    `SELECT ${SERMON_COLS} FROM blessboard.sermons WHERE id = $1 LIMIT 1`,
    [id]
  );
  return mapSermon(r.rows[0] || null);
}

async function insertContactChannel(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.contact_channels
       (church_id, branch_id, channel_type, label, value, sort_order, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${CONTACT_COLS}`,
    [
      fields.churchId,
      fields.branchId,
      fields.channelType,
      fields.label,
      fields.value,
      fields.sortOrder != null ? fields.sortOrder : 0,
      fields.status || "draft",
    ]
  );
  return mapContactChannel(r.rows[0] || null);
}

async function updateContactChannel(client, id, patch) {
  return optimisticUpdateRow(client, {
    table: "contact_channels",
    columns: CONTACT_COLS,
    id,
    setClause: `channel_type = COALESCE($2, channel_type),
            label = COALESCE($3, label),
            value = COALESCE($4, value),
            sort_order = COALESCE($5, sort_order),
            status = COALESCE($6, status)`,
    values: [
      patch.channelType != null ? patch.channelType : null,
      patch.label != null ? patch.label : null,
      patch.value != null ? patch.value : null,
      patch.sortOrder != null ? patch.sortOrder : null,
      patch.status != null ? patch.status : null,
    ],
    findById: findContactChannelById,
    mapper: mapContactChannel,
    expectedUpdatedAt: patch.expectedUpdatedAt,
  });
}

async function findContactChannelById(client, id) {
  const r = await client.query(
    `SELECT ${CONTACT_COLS} FROM blessboard.contact_channels WHERE id = $1 LIMIT 1`,
    [id]
  );
  return mapContactChannel(r.rows[0] || null);
}

async function insertGivingMethod(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.giving_methods
       (church_id, branch_id, method_type, label, description, account_details,
        instructions, external_url, button_label, qr_image_url, sort_order, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING ${GIVING_COLS}`,
    [
      fields.churchId,
      fields.branchId,
      fields.methodType,
      fields.label,
      fields.description != null ? fields.description : null,
      fields.accountDetails != null ? fields.accountDetails : null,
      fields.instructions,
      fields.externalUrl,
      fields.buttonLabel != null ? fields.buttonLabel : null,
      fields.qrImageUrl != null ? fields.qrImageUrl : null,
      fields.sortOrder != null ? fields.sortOrder : 0,
      fields.status || "draft",
    ]
  );
  return mapGivingMethod(r.rows[0] || null);
}

async function updateGivingMethod(client, id, patch) {
  const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);
  return optimisticUpdateRow(client, {
    table: "giving_methods",
    columns: GIVING_COLS,
    id,
    // Nullable text fields use explicit "present" flags so null clears the column
    // (COALESCE would preserve prior values and look like a failed save).
    setClause: `method_type = COALESCE($2, method_type),
            label = COALESCE($3, label),
            description = CASE WHEN $12::boolean THEN $4 ELSE description END,
            account_details = CASE WHEN $13::boolean THEN $5 ELSE account_details END,
            instructions = CASE WHEN $14::boolean THEN $6 ELSE instructions END,
            external_url = CASE WHEN $15::boolean THEN $7 ELSE external_url END,
            button_label = CASE WHEN $16::boolean THEN $8 ELSE button_label END,
            qr_image_url = CASE WHEN $17::boolean THEN $9 ELSE qr_image_url END,
            sort_order = COALESCE($10, sort_order),
            status = COALESCE($11, status)`,
    values: [
      patch.methodType != null ? patch.methodType : null,
      patch.label != null ? patch.label : null,
      has("description") ? patch.description : null,
      has("accountDetails") ? patch.accountDetails : null,
      has("instructions") ? patch.instructions : null,
      has("externalUrl") ? patch.externalUrl : null,
      has("buttonLabel") ? patch.buttonLabel : null,
      has("qrImageUrl") ? patch.qrImageUrl : null,
      patch.sortOrder != null ? patch.sortOrder : null,
      patch.status != null ? patch.status : null,
      has("description"),
      has("accountDetails"),
      has("instructions"),
      has("externalUrl"),
      has("buttonLabel"),
      has("qrImageUrl"),
    ],
    findById: findGivingMethodById,
    mapper: mapGivingMethod,
    expectedUpdatedAt: patch.expectedUpdatedAt,
  });
}

async function findGivingMethodById(client, id) {
  const r = await client.query(
    `SELECT ${GIVING_COLS} FROM blessboard.giving_methods WHERE id = $1 LIMIT 1`,
    [id]
  );
  return mapGivingMethod(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function findChurchStatus(client, churchId) {
  const r = await client.query(
    `SELECT id, status FROM blessboard.churches WHERE id = $1 LIMIT 1`,
    [churchId]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} branchId
 */
async function findBranchScope(client, branchId) {
  const r = await client.query(
    `SELECT id, church_id, status FROM blessboard.branches WHERE id = $1 LIMIT 1`,
    [branchId]
  );
  return r.rows[0] || null;
}

module.exports = {
  findPageByScope,
  findPageById,
  ensureDraftPage,
  updatePage,
  listSectionsForPage,
  insertSection,
  updateSection,
  findSectionById,
  findSectionByPageAndKey,
  findSectionByPageAndKeyForProvision,
  listLeaders,
  insertLeader,
  updateLeader,
  findLeaderById,
  listMinistries,
  insertMinistry,
  updateMinistry,
  findMinistryById,
  listEvents,
  insertEvent,
  updateEvent,
  findEventById,
  listSermons,
  insertSermon,
  updateSermon,
  findSermonById,
  listContactChannels,
  insertContactChannel,
  updateContactChannel,
  findContactChannelById,
  listGivingMethods,
  insertGivingMethod,
  updateGivingMethod,
  findGivingMethodById,
  findChurchStatus,
  findBranchScope,
};
