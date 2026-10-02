"use strict";

/**
 * BlessBoard data-job adapters.
 * Product owns member/pastoral mapping; platform owns job lifecycle + CSV parse.
 * Existing church member-import review/commit routes remain authoritative for commit.
 */

const {
  registerDataJobAdapter,
  buildCsvText,
} = require("../../platform/jobs");
const {
  mapHeader,
  classifyMemberType,
  parseAdminFlag,
  HEADER_ALIASES,
} = require("../../church/memberImportCsv");

const MEMBER_REQUIRED = ["full_name"];

function rowObject(headers, cells) {
  const out = {};
  headers.forEach((h, i) => {
    out[h] = cells[i] != null ? String(cells[i]).trim() : "";
  });
  return out;
}

function mapRowFields(headers, cells) {
  const raw = rowObject(headers, cells);
  const mapped = {};
  const ignored = [];
  let forbidden = null;
  for (const [header, value] of Object.entries(raw)) {
    const decision = mapHeader(header);
    if (decision.kind === "forbidden_tenant") {
      forbidden = decision.header;
      break;
    }
    if (decision.kind === "field") {
      mapped[decision.field] = value;
    } else {
      ignored.push(header);
    }
  }
  return { mapped, ignored, forbidden };
}

function registerBlessBoardDataJobAdapters() {
  registerDataJobAdapter({
    productCode: "blessboard",
    entityKey: "bb.member_import",
    jobKinds: ["import", "export"],
    requiredHeaders: MEMBER_REQUIRED,
    async previewImport({ headers, rows }) {
      const errors = [];
      const warnings = [];
      const acceptedRows = [];

      rows.forEach((cells, index) => {
        const line = index + 2;
        const { mapped, forbidden } = mapRowFields(headers, cells);
        if (forbidden) {
          errors.push({
            line,
            code: "forbidden_tenant_column",
            message: `Tenant column not allowed: ${forbidden}`,
          });
          return;
        }
        const fullName = String(mapped.full_name || "").trim();
        if (!fullName) {
          errors.push({ line, code: "required_fields", message: "full_name is required" });
          return;
        }
        const typeInfo = classifyMemberType(mapped.member_type);
        if (typeInfo.invalid) {
          errors.push({
            line,
            code: "invalid_member_type",
            message: `Unrecognized member_type: ${typeInfo.raw}`,
          });
          return;
        }
        acceptedRows.push({
          line,
          fullName: fullName.slice(0, 200),
          email: String(mapped.email || "").trim().slice(0, 254) || null,
          phone: String(mapped.phone || "").trim().slice(0, 40) || null,
          proposedStatus: typeInfo.proposedStatus,
          memberTypeLabel: typeInfo.label,
          isAdmin: parseAdminFlag(mapped.is_admin),
          externalKey: String(mapped.external_key || "").trim().slice(0, 100) || null,
        });
      });

      return {
        entityKey: "bb.member_import",
        acceptedCount: acceptedRows.length,
        errorCount: errors.length,
        warningCount: warnings.length,
        errors: errors.slice(0, 50),
        warnings: warnings.slice(0, 50),
        acceptedRows: acceptedRows.slice(0, 5000),
        note:
          "Preview only. Commit continues via church member-import review workflow.",
      };
    },
    async commitImport() {
      return {
        ok: false,
        code: "commit_via_church_review",
        reasonCode: "BB_MEMBER_IMPORT_COMMIT_VIA_REVIEW",
        message:
          "BlessBoard member import commit remains on the church review/commit routes.",
      };
    },
    async buildExport({ filters }) {
      const headers = Object.keys(HEADER_ALIASES);
      const sample = [
        {
          full_name: "Example Member",
          email: "member@example.com",
          phone: "260971000001",
          member_type: "visitor",
        },
      ];
      const text = buildCsvText(headers, filters && filters.template === "empty" ? [] : sample);
      return {
        filename: "bb-member-import-template.csv",
        contentType: "text/csv; charset=utf-8",
        body: text,
      };
    },
  });
}

module.exports = {
  registerBlessBoardDataJobAdapters,
};
