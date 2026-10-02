"use strict";

module.exports = {
  ...require("./matchCodes"),
  ...require("./scorePersonMatch"),
  ...require("./duplicatePolicies"),
  ...require("./personDuplicateEngine"),
};
