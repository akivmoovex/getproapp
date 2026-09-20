"use strict";

module.exports = {
  ...require("./formSchema"),
  ...require("./formAccess"),
  tenantFormService: require("./tenantFormService"),
  formShareService: require("./formShareService"),
  tenantFormRepository: require("./tenantFormRepository"),
};
