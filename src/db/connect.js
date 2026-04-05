"use strict";

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

function resolveSqlitePath() {
  return process.env.SQLITE_PATH
    ? path.isAbsolute(process.env.SQLITE_PATH)
      ? process.env.SQLITE_PATH
      : path.join(__dirname, "..", "..", process.env.SQLITE_PATH)
    : path.join(__dirname, "..", "..", "data", "getpro.sqlite");
}

/**
 * Open SQLite with the same path resolution and PRAGMAs as the historical monolithic db.js.
 */
function openDatabase() {
  const sqlitePath = resolveSqlitePath();
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const db = new Database(sqlitePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

module.exports = { resolveSqlitePath, openDatabase };
