/**
 * Per-tenant call center / WhatsApp / email for footers and company mini-site “GetPro support”.
 * Falls back to env (CALL_CENTER_PHONE, GETPRO_EMAIL), then platform defaults.
 */
const DEFAULT_CALLCENTER_PHONE = "+260211000101";
/** Shown under “GetPro support” on company pages (falls back to customer listing phone if unset). */
const DEFAULT_SUPPORT_HELP_PHONE = "+260211000101";
const DEFAULT_WHATSAPP_PHONE = "+260211000102";
const DEFAULT_CALLCENTER_EMAIL = "info@getproapp.org";

function pickPhone(dbVal, envVal) {
  const d = String(dbVal || "").trim();
  if (d) return d;
  const e = String(envVal || "").trim();
  if (e) return e;
  return DEFAULT_CALLCENTER_PHONE;
}

function pickEmail(dbVal, envVal) {
  const d = String(dbVal || "").trim();
  if (d) return d;
  const e = String(envVal || "").trim();
  if (e) return e;
  return DEFAULT_CALLCENTER_EMAIL;
}

function pickWhatsapp(dbVal) {
  const d = String(dbVal || "").trim();
  if (d) return d;
  return DEFAULT_WHATSAPP_PHONE;
}

/** Support helpline: dedicated column, else customer listing phone, else env/default. */
function pickSupportPhone(dbSupport, dbCustomer, envVal) {
  const s = String(dbSupport || "").trim();
  if (s) return s;
  return pickPhone(dbCustomer, envVal);
}

/** `tel:` href safe for mobile dialer (digits + optional leading +). */
function telHref(phone) {
  const s = String(phone || "").trim();
  if (!s) return "";
  const d = s.replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : "";
}

const tenantsRepo = require("../db/pg/tenantsRepo");

/**
 * @param {import("pg").Pool} pool
 * @param {number|null|undefined} tenantId
 */
async function getTenantContactSupportAsync(pool, tenantId) {
  const envPhone = process.env.CALL_CENTER_PHONE || "";
  const envEmail = process.env.GETPRO_EMAIL || "";
  const envAddr = process.env.GETPRO_ADDRESS || "";

  let row = null;
  if (pool && tenantId != null && Number(tenantId) > 0) {
    try {
      row = await tenantsRepo.getContactFieldsById(pool, Number(tenantId));
    } catch {
      row = null;
    }
  }

  const phone = pickPhone(row ? row.callcenter_phone : "", envPhone);
  const supportPhone = pickSupportPhone(
    row && row.support_help_phone != null ? row.support_help_phone : "",
    row ? row.callcenter_phone : "",
    envPhone
  );
  const email = pickEmail(row ? row.callcenter_email : "", envEmail);
  const whatsapp = pickWhatsapp(row ? row.whatsapp_phone : "");

  const digits = whatsapp.replace(/\D/g, "");
  const getproWhatsappHref = digits ? `https://wa.me/${digits}` : "";
  const getproTelHref = telHref(phone);
  const getproSupportTelHref = telHref(supportPhone);

  return {
    getproPhone: phone,
    getproTelHref,
    getproSupportPhone: supportPhone,
    getproSupportTelHref,
    getproEmail: email,
    getproWhatsapp: whatsapp,
    getproWhatsappHref,
    getproAddress: envAddr,
  };
}

module.exports = {
  DEFAULT_CALLCENTER_PHONE,
  DEFAULT_SUPPORT_HELP_PHONE,
  DEFAULT_WHATSAPP_PHONE,
  DEFAULT_CALLCENTER_EMAIL,
  getTenantContactSupportAsync,
};
