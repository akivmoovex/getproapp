"use strict";

/**
 * Transformation interface — pure mapping from V4 rows to V5 draft records.
 */

const mappers = {
  organization: require("./mappers/organization"),
  domain: require("./mappers/domain"),
  branch: require("./mappers/branch"),
  user_hq_admin: require("./mappers/userAdmin"),
  user_branch_admin: require("./mappers/userAdmin"),
  member: require("./mappers/member"),
  attendance_record: require("./mappers/attendance"),
  giving_summary: require("./mappers/giving"),
  announcement: require("./mappers/announcement"),
  ministry: require("./mappers/ministry"),
  event: require("./mappers/event"),
  audit_log: require("./mappers/audit"),
};

/**
 * @param {string} entity
 * @param {object} row
 * @param {object} ctx
 */
function transformRow(entity, row, ctx) {
  const mapper = mappers[entity];
  if (!mapper || typeof mapper.transform !== "function") {
    return {
      ok: false,
      status: "no_mapper",
      entity,
      record: null,
      warnings: [],
      quarantine: { reason: "no_mapper", row },
    };
  }
  return mapper.transform(row, ctx, entity);
}

module.exports = {
  transformRow,
  mappers,
};
