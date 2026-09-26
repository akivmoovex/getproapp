"use strict";

/**
 * Platform data-job file validation framework.
 * Product adapters supply schemas; platform owns size/encoding/CSV parse rules.
 */

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MiB
const DEFAULT_MAX_ROWS = 5000;

/**
 * Minimal RFC4180-style CSV parse (UTF-8 text).
 * @param {string} text
 * @returns {{ headers: string[], rows: string[][] }}
 */
function parseCsvText(text) {
  const input = String(text || "").replace(/^\uFEFF/, "");
  if (!input.trim()) {
    return { headers: [], rows: [] };
  }

  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch === "\r") {
      // ignore
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
    rows.push(row);
  }

  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => String(h || "").trim());
  return { headers, rows: rows.slice(1) };
}

function normalizeHeader(raw) {
  return String(raw || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Validate uploaded import bytes before product mapping.
 * @param {{
 *   buffer?: Buffer|null,
 *   text?: string|null,
 *   filename?: string|null,
 *   maxBytes?: number,
 *   maxRows?: number,
 *   requiredHeaders?: string[],
 * }} input
 */
function validateImportFile(input) {
  const src = input && typeof input === "object" ? input : {};
  const maxBytes = Number(src.maxBytes) > 0 ? Number(src.maxBytes) : DEFAULT_MAX_BYTES;
  const maxRows = Number(src.maxRows) > 0 ? Number(src.maxRows) : DEFAULT_MAX_ROWS;
  const filename = String(src.filename || "").trim() || "upload.csv";

  let text = src.text != null ? String(src.text) : null;
  if (text == null && src.buffer) {
    if (Buffer.isBuffer(src.buffer) && src.buffer.length > maxBytes) {
      return {
        ok: false,
        code: "file_too_large",
        reasonCode: "DATA_JOB_FILE_TOO_LARGE",
        maxBytes,
      };
    }
    text = Buffer.isBuffer(src.buffer)
      ? src.buffer.toString("utf8")
      : String(src.buffer || "");
  }
  if (text == null) {
    return { ok: false, code: "file_required", reasonCode: "DATA_JOB_FILE_REQUIRED" };
  }
  const byteLength = Buffer.byteLength(text, "utf8");
  if (byteLength > maxBytes) {
    return {
      ok: false,
      code: "file_too_large",
      reasonCode: "DATA_JOB_FILE_TOO_LARGE",
      maxBytes,
      byteLength,
    };
  }
  if (!/\.csv$/i.test(filename) && !String(text).includes(",")) {
    return { ok: false, code: "unsupported_file_type", reasonCode: "DATA_JOB_UNSUPPORTED_TYPE" };
  }

  const parsed = parseCsvText(text);
  if (!parsed.headers.length) {
    return { ok: false, code: "empty_file", reasonCode: "DATA_JOB_EMPTY_FILE" };
  }
  if (parsed.rows.length > maxRows) {
    return {
      ok: false,
      code: "too_many_rows",
      reasonCode: "DATA_JOB_TOO_MANY_ROWS",
      maxRows,
      rowCount: parsed.rows.length,
    };
  }

  const normalizedHeaders = parsed.headers.map(normalizeHeader);
  const required = Array.isArray(src.requiredHeaders)
    ? src.requiredHeaders.map(normalizeHeader)
    : [];
  const missing = required.filter((h) => !normalizedHeaders.includes(h));
  if (missing.length) {
    return {
      ok: false,
      code: "missing_headers",
      reasonCode: "DATA_JOB_MISSING_HEADERS",
      missing,
      headers: normalizedHeaders,
    };
  }

  // Reject tenant-forging columns in the platform layer.
  const forbidden = [
    "organization_id",
    "organisation_id",
    "tenant_id",
    "facility_id",
    "branch_id",
  ];
  const forged = normalizedHeaders.filter((h) => forbidden.includes(h));
  if (forged.length) {
    return {
      ok: false,
      code: "forbidden_tenant_columns",
      reasonCode: "DATA_JOB_FORBIDDEN_TENANT_COLUMNS",
      forged,
    };
  }

  return {
    ok: true,
    code: "ok",
    filename,
    byteLength,
    headers: normalizedHeaders,
    rows: parsed.rows,
    rowCount: parsed.rows.length,
  };
}

/**
 * Build a CSV string from headers + row objects/arrays.
 */
function buildCsvText(headers, rows) {
  const cols = Array.isArray(headers) ? headers.map(String) : [];
  const escape = (value) => {
    const text = value == null ? "" : String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    // Formula-injection guard for export privacy surfaces
    if (/^[=+\-@]/.test(text)) {
      return `'${text}`;
    }
    return text;
  };
  const lines = [cols.map(escape).join(",")];
  for (const row of rows || []) {
    if (Array.isArray(row)) {
      lines.push(row.map(escape).join(","));
    } else {
      lines.push(cols.map((h) => escape(row[h])).join(","));
    }
  }
  return `${lines.join("\n")}\n`;
}

module.exports = {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_ROWS,
  parseCsvText,
  normalizeHeader,
  validateImportFile,
  buildCsvText,
};
