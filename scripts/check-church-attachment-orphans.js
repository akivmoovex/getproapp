#!/usr/bin/env node
"use strict";

/**
 * Read-only audit of church attachment files not referenced in the database.
 *
 * Usage:
 *   npm run church:attachments:audit
 *
 * Reports relative stored filenames only — never absolute server paths.
 * Does not delete files. Exit 1 when orphans are found (or on connection failure).
 */

const { runBootstrap } = require("../src/startup/bootstrap");
runBootstrap();

const { getPgPool, isPgConfigured, closePgPool } = require("../src/db/pg/pool");
const {
  UPLOAD_ROOT,
  ANNOUNCEMENT_UPLOAD_ROOT,
} = require("../src/church/hqBroadcastUploads");
const { findOrphanRelativeFiles } = require("../src/church/churchAttachmentOrphanAudit");

async function loadReferencedFilenames(pool) {
  const broadcast = await pool.query(
    `SELECT stored_filename FROM public.church_hq_broadcast_attachments`
  );
  const announcement = await pool.query(
    `SELECT stored_filename FROM public.church_announcement_attachments`
  );
  const set = new Set();
  for (const row of broadcast.rows) {
    if (row.stored_filename) set.add(String(row.stored_filename).replace(/\\/g, "/"));
  }
  for (const row of announcement.rows) {
    if (row.stored_filename) set.add(String(row.stored_filename).replace(/\\/g, "/"));
  }
  return set;
}

async function main() {
  if (!isPgConfigured()) {
    // eslint-disable-next-line no-console
    console.error(
      "[getpro] church:attachments:audit — FAILED: PostgreSQL is not configured for this process."
    );
    process.exit(1);
  }

  const pool = getPgPool();
  let referenced;
  try {
    await pool.query("SELECT 1");
    referenced = await loadReferencedFilenames(pool);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      "[getpro] church:attachments:audit — FAILED: database unreachable.",
      e && e.code ? String(e.code) : ""
    );
    process.exit(1);
  } finally {
    await closePgPool().catch(() => {});
  }

  const broadcastAudit = findOrphanRelativeFiles(UPLOAD_ROOT, referenced);
  const announcementAudit = findOrphanRelativeFiles(ANNOUNCEMENT_UPLOAD_ROOT, referenced);
  const broadcastOrphans = broadcastAudit.orphans;
  const announcementOrphans = announcementAudit.orphans;

  // eslint-disable-next-line no-console
  console.log("[getpro] church:attachments:audit — summary");
  // eslint-disable-next-line no-console
  console.log(`  broadcast files on disk: ${broadcastAudit.filesOnDisk.length}`);
  // eslint-disable-next-line no-console
  console.log(`  announcement files on disk: ${announcementAudit.filesOnDisk.length}`);
  // eslint-disable-next-line no-console
  console.log(`  referenced in database: ${referenced.size}`);
  // eslint-disable-next-line no-console
  console.log(`  broadcast orphans: ${broadcastOrphans.length}`);
  // eslint-disable-next-line no-console
  console.log(`  announcement orphans: ${announcementOrphans.length}`);

  const printList = (label, list) => {
    if (!list.length) return;
    // eslint-disable-next-line no-console
    console.log(`  ${label}:`);
    for (const rel of list.slice(0, 200)) {
      // eslint-disable-next-line no-console
      console.log(`    ${rel}`);
    }
    if (list.length > 200) {
      // eslint-disable-next-line no-console
      console.log(`    … and ${list.length - 200} more`);
    }
  };

  printList("broadcast orphan relative paths", broadcastOrphans);
  printList("announcement orphan relative paths", announcementOrphans);

  if (broadcastOrphans.length || announcementOrphans.length) {
    // eslint-disable-next-line no-console
    console.error("[getpro] church:attachments:audit — orphans detected (read-only; no files deleted).");
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log("[getpro] church:attachments:audit — OK (no orphans).");
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[getpro] church:attachments:audit — FAILED:", err && err.message ? err.message : err);
  process.exit(1);
});
