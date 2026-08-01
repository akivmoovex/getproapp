"use strict";

/**
 * BlessBoard Privacy Policy — operational draft sections.
 * Only describes practices supported by current V5 implementation/docs.
 */

const { getLegalMetadata, buildPublicContactInstructions } = require("../config/legalMetadata");

/**
 * @returns {{ title: string, intro: string, sections: Array<{ id: string, number: string, title: string, html: string }> }}
 */
function buildPrivacyPolicyContent() {
  const meta = getLegalMetadata();
  const contactHtml = buildPublicContactInstructions(meta);

  const sections = [
    {
      id: "scope",
      number: "1",
      title: "Scope",
      html: `
<p>This Privacy Policy describes how BlessBoard collects, uses, stores, shares, and protects information when people use the public BlessBoard website, church websites hosted on the platform, the church-registration process, and authenticated portals.</p>
<p>Churches may have their own privacy notices and responsibilities for information they independently collect and manage. External websites linked from BlessBoard are governed by their own privacy policies.</p>`,
    },
    {
      id: "information-collected",
      number: "2",
      title: "Information We May Collect",
      html: `
<h3>A. Information you provide directly</h3>
<p>Depending on the feature you use, this may include name, email, telephone number, username, church affiliation, branch, role, profile information, registration details, ministry participation, attendance-related submissions, form submissions, requests, prayer or pastoral requests entered into enabled workflows, giving <em>records</em> (amounts/references without card numbers), uploaded documents or media metadata, announcements, messages, and support or onboarding requests.</p>
<h3>B. Information provided by church administrators</h3>
<p>Church staff may enter or manage member records, branch assignments, roles, account status, ministry data, attendance, internal notes, and verification decisions within their tenant.</p>
<h3>C. Automatically collected information</h3>
<p>We may collect IP address, browser and device information, pages visited, timestamps, login activity, request identifiers, security and audit logs, and cookie/session identifiers needed to operate and secure the service.</p>
<p>BlessBoard apex marketing pages do not load third-party advertising analytics trackers. The site may load fonts from Google Fonts to display typography.</p>
<h3>D. Payment-related information</h3>
<p>The current BlessBoard V5 giving features store aggregated or administrative giving records and related references. They are not designed to store card numbers, bank passwords, or payment tokens. If a church uses a third-party payment provider, that provider typically handles payment credentials under its own terms.</p>`,
    },
    {
      id: "how-used",
      number: "3",
      title: "How Information Is Used",
      html: `
<p>Information may be used to provide and operate the platform; authenticate users; route users to the correct church and role; manage organizations and branches; display authorized church content; support member and ministry workflows; process registration applications; record attendance or giving where enabled; send service communications; respond to support or onboarding requests; protect accounts; prevent fraud and abuse; diagnose errors; maintain audit trails; comply with legal obligations; and improve platform reliability.</p>
<p>BlessBoard does not use personal information for targeted third-party advertising on the current apex site.</p>`,
    },
    {
      id: "church-controlled",
      number: "4",
      title: "Church-Controlled Information",
      html: `
<p>Churches decide what member information to enter, who receives access, how roles are assigned, and what public content is published.</p>
<p>Members should contact their church administrator first regarding corrections to church-managed records, where appropriate. BlessBoard may assist the church with technical requests.</p>`,
    },
    {
      id: "legal-bases",
      number: "5",
      title: "Reasons for Processing",
      html: `
<p>Processing may occur because it is necessary to provide requested services; it supports legitimate operational and security interests; consent has been provided where required; the church has instructed the platform to process information; or a legal obligation applies.</p>
<p>Specific statutory labels (for example under a particular national privacy law) are jurisdiction-dependent and subject to legal review.</p>`,
    },
    {
      id: "sharing",
      number: "6",
      title: "How Information May Be Shared",
      html: `
<p>Information may be shared within the user’s church according to assigned roles; with authorized church administrators; with service providers supporting hosting, databases, email, storage, security, or payments where configured; where required by law; during a business restructuring; or to protect users, churches, the platform, and the public.</p>
<p>BlessBoard does not sell personal information to advertisers. Vendor names are not listed on this page unless confirmed for publication.</p>`,
    },
    {
      id: "public-information",
      number: "7",
      title: "Public Information",
      html: `
<p>Information posted on public church pages may be accessible worldwide and may be copied, indexed, or shared by third parties. Examples include church name, address, leadership profiles, ministries, sermons, public events, contact details, and public announcements.</p>
<p>Do not publish sensitive or private personal information on public pages.</p>`,
    },
    {
      id: "sensitive-pastoral",
      number: "8",
      title: "Sensitive and Pastoral Information",
      html: `
<p>Some church workflows may contain sensitive information, such as prayer or pastoral requests, family or ministry participation details, or giving records.</p>
<p>Organizations should restrict access to people who genuinely need it. BlessBoard is not an emergency service — do not rely on it for urgent safety situations.</p>`,
    },
    {
      id: "children",
      number: "9",
      title: "Children and Young People",
      html: `
<p>Churches may serve children and young people. Churches are responsible for obtaining parental or guardian permissions where required and limiting access appropriately.</p>
<p>Children’s information should not be published publicly without proper authority. No universal minimum age is stated on this page pending legal confirmation for target markets.</p>`,
    },
    {
      id: "cookies-sessions",
      number: "10",
      title: "Cookies and Sessions",
      html: `
<p>BlessBoard uses essential cookies and related mechanisms required for security and signed-in sessions, including:</p>
<ul>
  <li>Session cookies used to keep authenticated users signed in (default name <code>blessboard_org_sid</code>, configurable).</li>
  <li>CSRF protection cookies used to secure form submissions (default name <code>blessboard_org_csrf</code>).</li>
</ul>
<p>These cookies are necessary for core functionality and are not used for advertising. A separate cookie-consent banner for non-essential analytics is not required for the current apex implementation because third-party advertising analytics are not loaded there.</p>`,
    },
    {
      id: "storage-international",
      number: "11",
      title: "Data Storage and International Processing",
      html: `
<p>Information may be hosted or processed in countries different from the user’s country, depending on infrastructure providers used to operate the service.</p>
<p>Reasonable safeguards are used where required. Specific data-centre locations are not listed on this page unless confirmed for publication.</p>`,
    },
    {
      id: "security",
      number: "12",
      title: "Security",
      html: `
<p>BlessBoard uses reasonable administrative, organizational, and technical safeguards supported by the current implementation, which may include authentication, role-based access, tenant separation, encryption in transit (TLS), password hashing, CSRF protection, audit logging, backups, and access controls.</p>
<p>No online service can guarantee absolute security.</p>`,
    },
    {
      id: "retention",
      number: "13",
      title: "Retention",
      html: `
<p>Information is retained only as long as reasonably needed for service delivery, church administration, security, backups, legal obligations, disputes, and audit requirements.</p>
<p>Retention periods vary by data type and church instructions. Precise deletion schedules are not promised on this page unless approved and implemented.</p>`,
    },
    {
      id: "user-rights",
      number: "14",
      title: "User Choices and Rights",
      html: `
<p>Where applicable, users may request access, correction, deletion, restriction, objection, portability, withdrawal of consent, or review of account information.</p>
<p>Rights vary by location and circumstances. Church-managed records may need to be handled first by the relevant church administrator.</p>`,
    },
    {
      id: "preferences",
      number: "15",
      title: "Account and Communication Preferences",
      html: `
<p>Where available, users may update profile information, manage notification preferences, contact their administrator, or request account closure.</p>
<p>Essential service messages (such as security or account notices) may still be sent even when optional communications are limited.</p>`,
    },
    {
      id: "incidents",
      number: "16",
      title: "Data Breaches and Security Incidents",
      html: `
<p>BlessBoard will investigate suspected incidents and provide notices where legally required. No specific notification deadline is promised on this page pending jurisdiction-specific legal confirmation.</p>`,
    },
    {
      id: "third-party-services",
      number: "17",
      title: "Third-Party Services",
      html: `
<p>Integrations and external links have separate privacy practices. Review those third-party policies before providing information to them.</p>`,
    },
    {
      id: "changes",
      number: "18",
      title: "Changes to This Policy",
      html: `
<p>Updates will be posted with a revised effective date. Material changes may also be communicated through reasonable platform channels.</p>`,
    },
    {
      id: "contact",
      number: "19",
      title: "Contact and Complaints",
      html: `
<p>${contactHtml}</p>
<p>Depending on your location, you may have the right to contact an appropriate data-protection authority. No specific regulator is named on this page pending confirmation for target markets.</p>`,
    },
  ];

  return {
    title: "Privacy Policy",
    intro: `This Privacy Policy explains how ${meta.operatorDisplayName} handles personal and church-related information across public and authenticated services.`,
    draftBanner: meta.draftBanner,
    effectiveDateDisplay: meta.effectiveDateDisplay,
    effectiveDateIso: meta.effectiveDateIso,
    sections,
  };
}

module.exports = {
  buildPrivacyPolicyContent,
};
