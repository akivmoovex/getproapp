/**
 * Per-tenant call center / WhatsApp / email for footers and company mini-site “GetPro support”.
 * Falls back to env (CALL_CENTER_PHONE, GETPRO_EMAIL), then platform defaults.
 */
const DEFAULT_CALLCENTER_PHONE = "+260211000101";
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

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number|null|undefined} tenantId
 */
function getTenantContactSupport(db, tenantId) {
  const envPhone = process.env.CALL_CENTER_PHONE || "";
  const envEmail = process.env.GETPRO_EMAIL || "";
  const envAddr = process.env.GETPRO_ADDRESS || "";

  let row = null;
  if (db && tenantId != null && Number(tenantId) > 0) {
    try {
      row = db
        .prepare("SELECT callcenter_phone, whatsapp_phone, callcenter_email FROM tenants WHERE id = ?")
        .get(Number(tenantId));
    } catch {
      row = null;
    }
  }

  const phone = pickPhone(row ? row.callcenter_phone : "", envPhone);
  const email = pickEmail(row ? row.callcenter_email : "", envEmail);
  const whatsapp = pickWhatsapp(row ? row.whatsapp_phone : "");

  const digits = whatsapp.replace(/\D/g, "");
  const getproWhatsappHref = digits ? `https://wa.me/${digits}` : "";

  return {
    getproPhone: phone,
    getproEmail: email,
    getproWhatsapp: whatsapp,
    getproWhatsappHref,
    getproAddress: envAddr,
  };
}

module.exports = {
  DEFAULT_CALLCENTER_PHONE,
  DEFAULT_WHATSAPP_PHONE,
  DEFAULT_CALLCENTER_EMAIL,
  getTenantContactSupport,
};
