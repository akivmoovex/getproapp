"use strict";

/**
 * Public URL + QR helpers for shared tenant forms (SH07).
 */

const QRCode = require("qrcode");

/**
 * @param {{
 *   productCode: string,
 *   publicToken: string,
 *   baseUrl?: string,
 *   accessToken?: string,
 * }} input
 */
function buildPublicFormPath(input) {
  const token = String((input && input.publicToken) || "").trim();
  const product = String((input && input.productCode) || "").trim().toLowerCase();
  const prefix = product === "blessboard" ? "/f" : "/f";
  let path = `${prefix}/${encodeURIComponent(token)}`;
  if (input && input.accessToken) {
    path += `?t=${encodeURIComponent(String(input.accessToken))}`;
  }
  return path;
}

function buildPublicFormUrl(input) {
  const path = buildPublicFormPath(input);
  const base = String((input && input.baseUrl) || "").replace(/\/$/, "");
  if (!base) return path;
  return `${base}${path}`;
}

/**
 * @returns {Promise<{ ok: true, dataUrl: string } | { ok: false, reason: string }>}
 */
async function buildPublicFormQrDataUrl(input) {
  const url = buildPublicFormUrl(input);
  if (!url || url.length < 4) return { ok: false, reason: "url" };
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
      color: { dark: "#0F172A", light: "#FFFFFF" },
    });
    return { ok: true, dataUrl, url };
  } catch {
    return { ok: false, reason: "qr_failed" };
  }
}

module.exports = {
  buildPublicFormPath,
  buildPublicFormUrl,
  buildPublicFormQrDataUrl,
};
