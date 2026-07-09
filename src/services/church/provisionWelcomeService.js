"use strict";

const { churchPublicHost, churchPublicUrl } = require("../../church/platformProvisioningValidation");

function buildProvisionWelcomePack({ organization, branch, branchAdmin, branchAdminCredentials, hqAdmin }) {
  const hostSlug = branch.host_slug || branch.slug || organization.slug;
  const publicHost = churchPublicHost(hostSlug);
  const churchName = branch.name || organization.name;

  return {
    churchName,
    publicHost,
    publicUrl: churchPublicUrl(hostSlug),
    branchAdminLoginUrl: churchPublicUrl(hostSlug, "/branch/login"),
    memberRegisterUrl: churchPublicUrl(hostSlug, "/register"),
    hqLoginUrl: churchPublicUrl(hostSlug, "/hq/login"),
    branchAdmin: {
      full_name: branchAdmin.full_name || branchAdminCredentials.full_name,
      username: branchAdmin.username || branchAdminCredentials.username || branchAdmin.email,
      email: branchAdmin.email || branchAdminCredentials.email || null,
      temporary_password: branchAdminCredentials.temporary_password,
    },
    hqAdmin: hqAdmin
      ? {
          full_name: hqAdmin.full_name,
          email: hqAdmin.email || null,
        }
      : null,
    checklist: [
      "Log in to the branch admin portal",
      "Change your temporary password from Account settings",
      "Review and publish the About page content",
      "Confirm contact details on the public site",
      "Add events, sermons, and member resources",
      "Review pending member registrations",
    ],
  };
}

function formatWelcomeMessageText(pack) {
  if (!pack) return "";
  const lines = [
    `Welcome to BlessBoard — ${pack.churchName}`,
    "",
    "Your church public site is ready:",
    pack.publicUrl,
    "",
    "Branch admin login:",
    pack.branchAdminLoginUrl,
    `Username: ${pack.branchAdmin.username}`,
    `Temporary password: ${pack.branchAdmin.temporary_password}`,
    "",
    "Member registration:",
    pack.memberRegisterUrl,
    "",
    "First setup checklist:",
    ...pack.checklist.map((item, i) => `${i + 1}. ${item}`),
    "",
    "Share credentials securely. This password is shown once.",
  ];
  return lines.join("\n");
}

module.exports = {
  buildProvisionWelcomePack,
  formatWelcomeMessageText,
};
