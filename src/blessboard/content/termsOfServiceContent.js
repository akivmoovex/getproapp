"use strict";

/**
 * BlessBoard Terms of Service — operational draft sections.
 * Contact / jurisdiction use legalMetadata placeholders only.
 */

const { getLegalMetadata, buildPublicContactInstructions } = require("../config/legalMetadata");

/**
 * @returns {{ title: string, intro: string, sections: Array<{ id: string, number: string, title: string, html: string }> }}
 */
function buildTermsOfServiceContent() {
  const meta = getLegalMetadata();
  const contactHtml = buildPublicContactInstructions(meta);
  const jurisdictionHtml = meta.pending.governingLawJurisdiction
    ? `<p>These Terms are governed by the laws of ${meta.pending.governingLawJurisdiction}, without regard to conflict-of-law principles, except where mandatory local consumer or privacy laws apply.</p>`
    : `<p>Governing law and dispute venue are <strong>pending owner and legal confirmation</strong> and are not stated as a specific jurisdiction on this page. Nothing in these Terms limits rights that cannot lawfully be limited in your location.</p>`;

  const sections = [
    {
      id: "about-blessboard",
      number: "1",
      title: "About BlessBoard",
      html: `
<p>BlessBoard provides digital tools for churches and religious organizations. Depending on plan, configuration, region, and product availability, features may include public church websites, member portals, administration, communication, membership and ministry workflows, attendance, reporting, giving records, forms and requests, and related services.</p>
<p>${meta.platformTechnologyNote}</p>
<p>Feature availability may differ by selected plan, organization settings, enabled modules, and ongoing product development.</p>`,
    },
    {
      id: "who-may-use",
      number: "2",
      title: "Who May Use the Service",
      html: `
<p>You must provide accurate information when creating accounts or submitting applications. Account holders must be legally permitted to use the service. Church administrators must have authority to act for their organization.</p>
<p>Where a church serves minors, those individuals may use relevant church services only under the supervision or authorization required by that church and applicable law. You must not impersonate another person or organization.</p>`,
    },
    {
      id: "church-accounts",
      number: "3",
      title: "Church and Organization Accounts",
      html: `
<p>The church or organization is responsible for appointing authorized administrators, controlling role assignments, reviewing member access, maintaining accurate information, obtaining necessary notices and permissions from members, deciding what information is published publicly, and complying with applicable laws and internal church policies.</p>
<p>BlessBoard provides the platform. It does not control a church’s independent decisions about membership, leadership, ministry participation, giving, discipline, or pastoral matters.</p>`,
    },
    {
      id: "user-accounts-security",
      number: "4",
      title: "User Accounts and Security",
      html: `
<p>Users must protect usernames and passwords, not share privileged accounts, notify the platform or a church administrator of suspected unauthorized access, keep contact details current, and log out from shared devices.</p>
<p>BlessBoard may suspend access where security issues, abuse, fraud, or unauthorized activity is suspected.</p>`,
    },
    {
      id: "acceptable-use",
      number: "5",
      title: "Acceptable Use",
      html: `
<p>You must not use the service for unlawful purposes; harassment; fraud; impersonation; unauthorized access; malware; interference with the platform; mass unsolicited messaging; uploading content without permission; violating privacy or intellectual-property rights; scraping or extracting data without authorization; using another church’s tenant or data; or attempting to bypass role or subscription limits.</p>`,
    },
    {
      id: "content",
      number: "6",
      title: "Church Content and User Content",
      html: `
<p>Organizations and users retain ownership of content they upload. BlessBoard receives a limited permission to host, process, display, back up, and transmit content only as needed to operate the service.</p>
<p>Users are responsible for ensuring they have permission to upload photographs, sermons, documents, logos, member information, announcements, recordings, and other materials.</p>
<p>BlessBoard may remove content that is unlawful, unsafe, abusive, technically harmful, or that violates these Terms.</p>`,
    },
    {
      id: "public-websites",
      number: "7",
      title: "Public Church Websites",
      html: `
<p>Church administrators control what is published on their public church pages. Public content may be viewed and indexed by third parties.</p>
<p>Organizations must not publish private member, child, pastoral, financial, prayer, or health information without an appropriate lawful basis and permission.</p>`,
    },
    {
      id: "privacy",
      number: "8",
      title: "Privacy and Data Protection",
      html: `
<p>Please read our separate <a href="/privacy">Privacy Policy</a>.</p>
<p>Each church may act as the primary decision-maker regarding member information entered into its tenant account, while BlessBoard may process that information to provide the service. Formal controller/processor classifications can vary by jurisdiction and arrangement and are subject to legal review.</p>`,
    },
    {
      id: "giving-payments",
      number: "9",
      title: "Giving and Payments",
      html: `
<p>Where giving features are enabled, BlessBoard may display, record, or facilitate giving-related <strong>records and information</strong>. The current product focuses on administrative giving records and related reporting; it is not a bank and does not itself process card payments as a payment gateway in the current V5 implementation.</p>
<p>If a church later enables third-party payment collection, those providers’ terms apply to payment processing. Users remain responsible for confirming church details before sending money. Fees, refunds, receipts, taxes, and chargebacks may be governed by the church and any payment provider.</p>`,
    },
    {
      id: "plans-fees",
      number: "10",
      title: "Plans, Fees, and Changes",
      html: `
<p>Some services are available on a free plan. Paid features may require a subscription. Current plan descriptions and prices are shown on the <a href="/pricing">pricing page</a> or in a separate order agreement.</p>
<p>Plan limits may include users, branches, storage, reporting, domains, or other features. Applicable taxes may apply. Pricing or features may change with reasonable notice where required. Specific refund periods, billing cycles, and cancellation rights are not invented here and will follow approved commercial terms when published.</p>`,
    },
    {
      id: "free-plan",
      number: "11",
      title: "Free Plan",
      html: `
<p>The Free / Foundation plan may include limited users, branches, storage, support, or features. Free-plan availability and limits may change; existing churches should receive reasonable notice where practical.</p>
<p>Public registration for a free plan creates a <strong>pending application</strong> for platform-admin review and does not automatically activate a live church, domain, or privileged account.</p>`,
    },
    {
      id: "suspension-termination",
      number: "12",
      title: "Suspension and Termination",
      html: `
<p>Access may be suspended or terminated for non-payment, security risks, unlawful activity, serious misuse, repeated Terms violations, requests by the church account owner, or discontinued service.</p>
<p>Where practical, reasonable efforts may be made to provide notice and data-export opportunities, subject to security, law, technical limits, and account status.</p>`,
    },
    {
      id: "data-export-closure",
      number: "13",
      title: "Data Export and Account Closure",
      html: `
<p>Authorized church administrators may request export or closure through available platform tools or by contacting the platform using the channels listed below.</p>
<p>Some records may be retained for security, legal, backup, audit, fraud-prevention, or dispute purposes. Specific deletion periods are not promised on this page unless implemented and approved.</p>`,
    },
    {
      id: "availability",
      number: "14",
      title: "Availability and Changes",
      html: `
<p>The service may sometimes be unavailable for maintenance, upgrades, hosting failures, internet outages, security incidents, or circumstances beyond reasonable control.</p>
<p>Features may be improved, replaced, or discontinued. BlessBoard does not promise uninterrupted or error-free operation.</p>`,
    },
    {
      id: "third-parties",
      number: "15",
      title: "Third-Party Services and Links",
      html: `
<p>BlessBoard may integrate with or link to third-party services. Third-party terms and privacy policies apply to those services. BlessBoard is not responsible for independently operated external websites or services.</p>`,
    },
    {
      id: "intellectual-property",
      number: "16",
      title: "Intellectual Property",
      html: `
<p>BlessBoard software, branding, interface, documentation, and platform materials are protected by applicable intellectual-property laws. You may not copy, reverse engineer, resell, or create unauthorized derivative services except where applicable law permits.</p>
<p>Churches retain rights in their own names, logos, sermons, documents, and uploaded content.</p>`,
    },
    {
      id: "disclaimers",
      number: "17",
      title: "Disclaimers",
      html: `
<p>BlessBoard is a technology platform. It does not provide legal, tax, accounting, pastoral, medical, or financial advice, and it is not an emergency service.</p>
<p>Church administrators remain responsible for verifying reports, financial records, attendance data, communications, and decisions made using the platform.</p>`,
    },
    {
      id: "limitation-of-liability",
      number: "18",
      title: "Limitation of Liability",
      html: `
<p>To the extent permitted by applicable law, BlessBoard is not responsible for indirect, incidental, special, consequential, or lost-profit damages arising from use of the service.</p>
<p>Nothing in these Terms excludes rights or liability that cannot legally be excluded. No monetary liability cap is stated on this page pending legal review.</p>`,
    },
    {
      id: "indemnity",
      number: "19",
      title: "Indemnity",
      html: `
<p>To the extent permitted by law, an organization may be responsible for claims arising from its unlawful content, misuse, unauthorized data collection, or breach of these Terms.</p>`,
    },
    {
      id: "governing-law",
      number: "20",
      title: "Governing Law and Disputes",
      html: jurisdictionHtml,
    },
    {
      id: "changes",
      number: "21",
      title: "Changes to These Terms",
      html: `
<p>Updated Terms may be posted with a revised effective date. Material changes may also be communicated through the website, email, or platform notice where appropriate.</p>`,
    },
    {
      id: "contact",
      number: "22",
      title: "Contact",
      html: `<p>${contactHtml}</p>`,
    },
  ];

  return {
    title: "Terms of Service",
    intro: `These Terms of Service (“Terms”) govern access to and use of BlessBoard websites, applications, church-management tools, and related services operated under the ${meta.operatorDisplayName} brand. By using the service, you agree to these Terms.`,
    draftBanner: meta.draftBanner,
    effectiveDateDisplay: meta.effectiveDateDisplay,
    effectiveDateIso: meta.effectiveDateIso,
    sections,
  };
}

module.exports = {
  buildTermsOfServiceContent,
};
