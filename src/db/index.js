"use strict";

const { openDatabase } = require("./connect");
const { applyBaseSchema } = require("./schema");
const { applyBaseIndexes } = require("./indexes");
const { runAllMigrations } = require("./migrations");
const { createQueryHelpers } = require("./queryHelpers");
const { ensureCompanyDirectoryFtsInSync } = require("../companies/companySearchFts");

const db = openDatabase();
applyBaseSchema(db);
applyBaseIndexes(db);
runAllMigrations(db);
ensureCompanyDirectoryFtsInSync(db);

const { run, getOne, getAll } = createQueryHelpers(db);

module.exports = {
  db,
  run,
  getOne,
  getAll,
};
