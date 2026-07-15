"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "data", "uploads", "church", "member-imports");
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 2000;

function ensureUploadRoot() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

function safeOriginalName(name) {
  return (
    String(name || "import.csv")
      .replace(/[/\\?%*:|"<>]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || "import.csv"
  );
}

function absolutePathUnderRoot(storedRelpath) {
  const rel = String(storedRelpath || "").replace(/^[/\\]+/, "");
  if (!rel || rel.includes("..")) return null;
  const abs = path.resolve(UPLOAD_ROOT, rel);
  const root = path.resolve(UPLOAD_ROOT);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/**
 * Store CSV under tenant-isolated path: {organizationId}/{branchId}/{batchKey}/
 * @returns {{ storedRelpath: string, absolutePath: string, byteSize: number, contentSha256: string }}
 */
function persistImportCsv({ organizationId, branchId, batchKey, originalFilename, buffer }) {
  ensureUploadRoot();
  const orgId = Number(organizationId);
  const brId = Number(branchId);
  const key = String(batchKey || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
  if (!Number.isFinite(orgId) || orgId <= 0 || !Number.isFinite(brId) || brId <= 0 || !key) {
    const err = new Error("Invalid import storage path.");
    err.code = "INVALID_UPLOAD_PATH";
    throw err;
  }
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ""), "utf8");
  if (buf.length > MAX_BYTES) {
    const err = new Error("CSV file is too large (max 2 MB).");
    err.code = "FILE_TOO_LARGE";
    throw err;
  }
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const safeName = safeOriginalName(originalFilename).replace(/\.[^.]+$/, "") + ".csv";
  const storedRelpath = path.join(String(orgId), String(brId), key, safeName);
  const absolutePath = absolutePathUnderRoot(storedRelpath);
  if (!absolutePath) {
    const err = new Error("Could not resolve safe upload path.");
    err.code = "INVALID_UPLOAD_PATH";
    throw err;
  }
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, buf);
  return {
    storedRelpath: storedRelpath.split(path.sep).join("/"),
    absolutePath,
    byteSize: buf.length,
    contentSha256: sha,
  };
}

module.exports = {
  UPLOAD_ROOT,
  MAX_BYTES,
  MAX_ROWS,
  ensureUploadRoot,
  safeOriginalName,
  absolutePathUnderRoot,
  persistImportCsv,
};
