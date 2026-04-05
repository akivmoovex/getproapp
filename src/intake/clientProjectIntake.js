/**
 * Admin console: client + project intake (“New Project”).
 *
 * Internal keys: INTEGER PRIMARY KEY on intake_clients / intake_client_projects (immutable).
 * Public codes: client_code, project_code — UNIQUE per tenant; PREFIX-000001 uses tenants.intake_code_prefix
 * when set (explicit per-tenant config), otherwise a slug-derived prefix (alphanumeric, max 6 chars).
 * Uniqueness: UNIQUE(tenant_id, client_code|project_code) + intake_code_sequences (transactional next_seq).
 */

const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const { isValidPhoneForTenant } = require("../tenants");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "data", "uploads", "intake");

function ensureUploadRoot() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

function normalizeDigits(input) {
  return String(input || "").replace(/\D/g, "");
}

function normalizeNrz(input) {
  return String(input || "").trim().toUpperCase().replace(/\s+/g, "");
}

function getTenantSlug(db, tenantId) {
  const row = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(Number(tenantId));
  return row ? String(row.slug) : "";
}

/**
 * Budget display for the project form: Zambia → K; Demo → ProCoin; other tenants → slug-based label.
 */
function getBudgetMetaForTenant(db, tenantId) {
  const slug = getTenantSlug(db, tenantId);
  if (slug === "zm") {
    return { code: "ZMW", displayPrefix: "K", label: "Zambian Kwacha (prefix: K)" };
  }
  if (slug === "demo") {
    return { code: "PROC", displayPrefix: "ProCoin", label: "ProCoin (demo tenant)" };
  }
  const up = slug.replace(/[^a-z0-9]/gi, "").toUpperCase() || "CUR";
  return { code: up, displayPrefix: up, label: `Budget (${slug})` };
}

function slugToPrefix(slug) {
  const s = String(slug || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return s.slice(0, 6) || "RG";
}

/**
 * Prefix for public client/project codes: tenants.intake_code_prefix (trimmed, A–Z/0–9, max 6) when set;
 * otherwise derived from slug. Empty DB column means “use slug fallback”.
 */
function getIntakeCodePrefix(db, tenantId) {
  let row;
  try {
    row = db.prepare("SELECT slug, intake_code_prefix FROM tenants WHERE id = ?").get(Number(tenantId));
  } catch {
    row = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(Number(tenantId));
  }
  if (!row) throw new Error("Tenant not found");
  const configured = row.intake_code_prefix != null ? String(row.intake_code_prefix) : "";
  const cleaned = configured.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length > 0) return cleaned.slice(0, 6);
  return slugToPrefix(row.slug);
}

function nextSequentialCode(db, tenantId, scope) {
  const prefix = getIntakeCodePrefix(db, tenantId);
  const seq = db.transaction(() => {
    const cur = db.prepare("SELECT next_seq FROM intake_code_sequences WHERE tenant_id = ? AND scope = ?").get(
      tenantId,
      scope
    );
    if (!cur) {
      db.prepare("INSERT INTO intake_code_sequences (tenant_id, scope, next_seq) VALUES (?, ?, 2)").run(
        tenantId,
        scope
      );
      return 1;
    }
    const n = cur.next_seq;
    db.prepare("UPDATE intake_code_sequences SET next_seq = next_seq + 1 WHERE tenant_id = ? AND scope = ?").run(
      tenantId,
      scope
    );
    return n;
  })();
  return `${prefix}-${String(seq).padStart(6, "0")}`;
}

function findClientBySearch(db, tenantId, { phone, nrz }) {
  const tid = Number(tenantId);
  const p = normalizeDigits(phone);
  const n = normalizeNrz(nrz);
  if (!p && !n) return null;
  if (p) {
    const byPhone = db.prepare("SELECT * FROM intake_clients WHERE tenant_id = ? AND phone_normalized = ?").get(tid, p);
    if (byPhone) return byPhone;
  }
  if (n) {
    const byNrz = db.prepare("SELECT * FROM intake_clients WHERE tenant_id = ? AND nrz_normalized = ?").get(tid, n);
    if (byNrz) return byNrz;
  }
  return null;
}

function validateNrz(nrz) {
  const s = normalizeNrz(nrz);
  if (!s) return { ok: true, value: "" };
  if (s.length < 2 || s.length > 40) return { ok: false, error: "NRZ must be between 2 and 40 characters." };
  if (!/^[A-Z0-9-]+$/.test(s)) return { ok: false, error: "NRZ may contain letters, digits, and hyphens only." };
  return { ok: true, value: s };
}

/** Binds OTP to tenant + normalized phone so a row cannot verify for another number without the code. */
function hashOtpCode(code, tenantId, phoneNormalized) {
  const pepper = process.env.GETPRO_OTP_PEPPER || "getpro_dev_otp_pepper_change_me";
  const payload = `v2|${Number(tenantId)}|${String(phoneNormalized)}|phone_verify|${String(code)}`;
  return crypto.pbkdf2Sync(payload, pepper, 12000, 32, "sha256").toString("hex");
}

function verifyOtpCodeHash(code, storedHash, tenantId, phoneNormalized) {
  const h = hashOtpCode(code, tenantId, phoneNormalized);
  try {
    return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(String(storedHash), "hex"));
  } catch {
    return false;
  }
}

function generateOtpDigits() {
  return String(crypto.randomInt(100000, 1000000));
}

function countRecentOtpSends(db, tenantId, phoneNorm) {
  return db
    .prepare(
      `SELECT COUNT(*) AS c FROM intake_phone_otp
       WHERE tenant_id = ? AND phone_normalized = ?
       AND datetime(created_at) > datetime('now', '-1 hour')`
    )
    .get(tenantId, phoneNorm).c;
}

/**
 * SMS is not wired to a production provider here. Integrate via env-driven adapter later.
 * - GETPRO_SMS_PROVIDER=console — logs code (dev/staging only; blocked when NODE_ENV=production).
 * - GETPRO_OTP_DEV_LOG=1 — same as console but explicit dev flag (blocked in production).
 * - GETPRO_SMS_LIVE=1 — set when production SMS is wired; hides the admin OTP operational banner (getIntakeOtpOperationalBanner).
 */
function sendOtpPlaceholder({ phoneDisplay, code }) {
  if (process.env.NODE_ENV === "production") {
    if (process.env.GETPRO_SMS_PROVIDER === "console" || process.env.GETPRO_OTP_DEV_LOG === "1") {
      return { sent: false, error: "Dev OTP logging is disabled in production." };
    }
    return {
      sent: false,
      error:
        "SMS is not configured for production. Set up GETPRO_SMS_* integration (see clientProjectIntake.js).",
    };
  }
  if (process.env.GETPRO_OTP_DEV_LOG === "1" || process.env.GETPRO_SMS_PROVIDER === "console") {
    // eslint-disable-next-line no-console
    console.log(`[getpro OTP] (dev/console) ${phoneDisplay} => ${code}`);
    return { sent: true, devMode: true };
  }
  return {
    sent: false,
    error:
      "No SMS provider active. For local testing set GETPRO_SMS_PROVIDER=console or GETPRO_OTP_DEV_LOG=1 (non-production only).",
  };
}

function validatePhonesForTenant(db, tenantId, phone, whatsapp) {
  const slug = getTenantSlug(db, tenantId);
  const p = String(phone || "").trim();
  const w = String(whatsapp || "").trim();
  if (!p) return { ok: false, error: "Phone number is required." };
  if (!isValidPhoneForTenant(slug, p)) return { ok: false, error: "Phone number does not match the expected format for this region." };
  if (w && !isValidPhoneForTenant(slug, w)) return { ok: false, error: "WhatsApp number does not match the expected format for this region." };
  return { ok: true, phone: p, whatsapp: w };
}

/**
 * Resolve DB-stored relative path to absolute file under UPLOAD_ROOT; returns null if unsafe.
 */
function safeAbsoluteImagePath(relStored) {
  const rel = String(relStored || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return null;
  const abs = path.join(UPLOAD_ROOT, rel);
  const root = path.resolve(UPLOAD_ROOT);
  if (!abs.startsWith(root)) return null;
  return abs;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * @param {Array<{ buffer: Buffer, mimetype?: string }>} files
 * @returns {Promise<string[]>} relative paths under UPLOAD_ROOT
 */
async function processAndSaveProjectImages(tenantId, projectId, files) {
  ensureUploadRoot();
  const tid = String(tenantId);
  const pid = String(projectId);
  const baseDir = path.join(UPLOAD_ROOT, tid, pid);
  fs.mkdirSync(baseDir, { recursive: true });
  const relPaths = [];
  let order = 0;
  const list = (files || []).slice(0, 5);
  for (const f of list) {
    if (!f || !f.buffer || f.buffer.length < 8) continue;
    if (f.buffer.length > MAX_IMAGE_BYTES) continue;
    const mime = String(f.mimetype || "").toLowerCase();
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime)) continue;

    const name = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}.jpg`;
    const abs = path.join(baseDir, name);
    await sharp(f.buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(abs);
    relPaths.push(path.join(tid, pid, name).replace(/\\/g, "/"));
    order += 1;
    if (order >= 5) break;
  }
  return relPaths;
}

/**
 * Admin UI: show until real SMS delivery is confirmed for this deployment.
 * Set GETPRO_SMS_LIVE=1 when ops has wired a production SMS provider (hides the banner).
 */
function getIntakeOtpOperationalBanner() {
  if (String(process.env.GETPRO_SMS_LIVE || "").trim() === "1") return null;
  if (process.env.NODE_ENV === "production") {
    return {
      level: "warn",
      text: "Production: SMS OTP is not marked as live (GETPRO_SMS_LIVE is unset). “Send OTP” will not text the customer until an SMS provider is integrated and this flag is set per your runbook.",
    };
  }
  return {
    level: "info",
    text: "Non-production / test mode: OTP codes are not sent as real SMS unless GETPRO_SMS_PROVIDER=console or GETPRO_OTP_DEV_LOG=1 is set—they appear in the server log only.",
  };
}

/** Human label for intake project lifecycle / legacy status. */
function intakeProjectStatusLabel(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "draft") return "Draft";
  if (s === "needs_review") return "Needs review";
  if (s === "ready_to_publish") return "Ready to publish";
  if (s === "published") return "Published";
  if (s === "closed") return "Closed";
  if (s === "new") return "Published (legacy)";
  if (s === "submitted") return "Published (legacy)";
  return String(status || "—");
}

module.exports = {
  UPLOAD_ROOT,
  ensureUploadRoot,
  normalizeDigits,
  normalizeNrz,
  getTenantSlug,
  getBudgetMetaForTenant,
  nextSequentialCode,
  getIntakeCodePrefix,
  findClientBySearch,
  validateNrz,
  hashOtpCode,
  verifyOtpCodeHash,
  generateOtpDigits,
  countRecentOtpSends,
  sendOtpPlaceholder,
  validatePhonesForTenant,
  safeAbsoluteImagePath,
  processAndSaveProjectImages,
  MAX_IMAGE_BYTES,
  getIntakeOtpOperationalBanner,
  intakeProjectStatusLabel,
};
