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
const phoneRulesService = require("../phone/phoneRulesService");
const tenantsRepo = require("../db/pg/tenantsRepo");
const intakeCodeSequencesRepo = require("../db/pg/intakeCodeSequencesRepo");
const intakeClientsRepo = require("../db/pg/intakeClientsRepo");
const intakePhoneOtpRepo = require("../db/pg/intakePhoneOtpRepo");

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

function budgetMetaFromSlug(slug) {
  if (slug === "zm") {
    return { code: "ZMW", displayPrefix: "K", label: "Zambian Kwacha (prefix: K)" };
  }
  if (slug === "demo") {
    return { code: "PROC", displayPrefix: "ProCoin", label: "ProCoin (demo tenant)" };
  }
  const up = String(slug || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase() || "CUR";
  return { code: up, displayPrefix: up, label: `Budget (${slug})` };
}

function slugToPrefix(slug) {
  const s = String(slug || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return s.slice(0, 6) || "RG";
}

/**
 * @param {{ slug?: unknown, intake_code_prefix?: unknown }} row
 */
function intakePrefixFromTenantRow(row) {
  if (!row) throw new Error("Tenant not found");
  const configured = row.intake_code_prefix != null ? String(row.intake_code_prefix) : "";
  const cleaned = configured.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length > 0) return cleaned.slice(0, 6);
  return slugToPrefix(row.slug);
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

async function nextSequentialCodeWithStore(pool, tenantId, scope) {
  const tid = Number(tenantId);
  const row = await tenantsRepo.getById(pool, tid);
  const prefix = intakePrefixFromTenantRow(row);
  const n = await intakeCodeSequencesRepo.bumpAndReturnSeq(pool, tid, scope);
  return `${prefix}-${String(n).padStart(6, "0")}`;
}

async function findClientBySearchWithStore(pool, tenantId, { phone, nrz }) {
  const tid = Number(tenantId);
  const p = normalizeDigits(phone);
  const n = normalizeNrz(nrz);
  if (!p && !n) return null;
  if (p) {
    const byPhone = await intakeClientsRepo.findByPhoneNorm(pool, tid, p);
    if (byPhone) return byPhone;
  }
  if (n) {
    return intakeClientsRepo.findByNrzNorm(pool, tid, n);
  }
  return null;
}

async function countRecentOtpSendsWithStore(pool, tenantId, phoneNorm) {
  return intakePhoneOtpRepo.countRecentSends(pool, Number(tenantId), phoneNorm);
}

async function validatePhonesForTenantWithStore(pool, tenantId, phone, whatsapp) {
  const tid = Number(tenantId);
  const p = String(phone || "").trim();
  const w = String(whatsapp || "").trim();
  if (!p) return { ok: false, error: "Phone number is required." };
  const vp = await phoneRulesService.validatePhoneForTenant(pool, tid, p, "phone");
  if (!vp.ok) return { ok: false, error: vp.error || "Phone number does not match the expected format for this region." };
  if (w) {
    const vw = await phoneRulesService.validatePhoneForTenant(pool, tid, w, "whatsapp");
    if (!vw.ok) return { ok: false, error: vw.error || "WhatsApp number does not match the expected format for this region." };
  }
  return { ok: true, phone: p, whatsapp: w };
}

async function getBudgetMetaForTenantWithStore(pool, tenantId) {
  const row = await tenantsRepo.getById(pool, Number(tenantId));
  const slug = row ? String(row.slug) : "";
  return budgetMetaFromSlug(slug);
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
  getBudgetMetaForTenantWithStore,
  nextSequentialCodeWithStore,
  findClientBySearchWithStore,
  validateNrz,
  hashOtpCode,
  verifyOtpCodeHash,
  generateOtpDigits,
  countRecentOtpSendsWithStore,
  sendOtpPlaceholder,
  validatePhonesForTenantWithStore,
  safeAbsoluteImagePath,
  processAndSaveProjectImages,
  MAX_IMAGE_BYTES,
  getIntakeOtpOperationalBanner,
  intakeProjectStatusLabel,
};
