# ActiveClinic mini-website Stitch inventory

**Stitch project:** [ActiveClinic Universal Authentication Interface](https://stitch.withgoogle.com/projects/10611909237747031838)  
**Project ID:** `10611909237747031838`  
**Inspected:** 2026-08-19 via Stitch MCP `list_screens`  
**Product surface:** clinic mini-website, editor, CMS, media, drafts/publishing  

Do **not** invent screens. MW08, MW09, and MW10 have **zero** screens in this project.

Auth screens (`active-clinic-03-*`) are out of scope for this mini-website task.

| Phase | Stitch screen | Screen ID | Device | Route / implementation | Status |
|-------|---------------|-----------|--------|------------------------|--------|
| MW01 | MW01-01 Clinic Website Home | `97a428ff4b4d45abbe6d03b192f04ffb` | Desktop | `/clinics/:clinicKey` | IMPLEMENTED_WITH_MINOR_VARIANCE |
| MW01 | MW01-02 Clinic Website Mobile Home | `b6287290e9264712a5b89da04c12a325` | Mobile | `/clinics/:clinicKey` (responsive) | IMPLEMENTED_WITH_MINOR_VARIANCE |
| MW01 | MW01-03 Website Editor Home | `effdec3344324c33aa7e3d8eb8f60002` | Desktop | `/clinics/:clinicKey?website_edit=1` | IMPLEMENTED_WITH_MINOR_VARIANCE |
| MW01 | MW01-04 Website Editor Mobile | `23774b8a4baf4924bc659f4ad86708e0` | Mobile | same, responsive editor chrome | IMPLEMENTED_WITH_MINOR_VARIANCE |
| MW02 | MW02-01 Inline Text Editing | `32e4cba9812c43f5ae9a808222ca6dbb` | Desktop | existing inline editor | IMPLEMENTED_MATCH |
| MW02 | MW02-02 Inline Image Editing | `70cbbaefaa7f4e2ca2aafb583c33d84f` | Desktop | existing inline image editor | IMPLEMENTED_MATCH |
| MW02 | MW02-03 Inline Section Editing | `aa63525e14b342709f3636906ab2afb3` | Desktop | inline fields + section manager | IMPLEMENTED_WITH_MINOR_VARIANCE |
| MW02 | MW02-04 Mobile Inline Editing | `ead1eaa3d72c4eea884010b4ef6b5a18` | Mobile | responsive inline editor | IMPLEMENTED_WITH_MINOR_VARIANCE |
| MW03 | MW03-01 Manage Sections | `f19c2a311e9b4f0d878e3ec51dae2769` | Desktop | `/app/settings/website/sections` | IMPLEMENTED_MATCH |
| MW03 | MW03-02 Add Section | `6f3db361015d4c51b2323bd441b6e181` | Desktop | Add Section dialog | IMPLEMENTED_MATCH |
| MW03 | MW03-03 Reorder Sections | `2552e98a7d8d4b4695bbc4f5f629b9c0` | Desktop | section reorder form | IMPLEMENTED_MATCH |
| MW03 | MW03-04 Section Settings | `27d259868bd846c091c61d27744a2c42` | Desktop | `/app/settings/website/sections/:id` | IMPLEMENTED_MATCH |
| MW04 | MW04-01 Pages Manager | `a2aaa656090347548594e79d9c7b401d` | Desktop | `/app/settings/website/pages` | IMPLEMENTED_MATCH |
| MW04 | MW04-02 Add New Page | `36f2e7a043d344b98b391e464f451bb8` | Desktop | `/app/settings/website/pages/new` | IMPLEMENTED_MATCH |
| MW04 | MW04-03 Edit Page Settings | `943371c07cd34875a6ea02dc7c03d3bf` | Desktop | `/app/settings/website/pages/:id` | IMPLEMENTED_MATCH |
| MW04 | MW04-04 Navigation Manager | `e7e2a1ab35a34e16a9e279a6f36c0d6f` | Desktop | `/app/settings/website/navigation` | IMPLEMENTED_MATCH |
| MW05 | MW05-01 Page Builder | `df0401b47e454504b0d24ed27abf1c92` | Desktop | `/app/settings/website/pages/:id/builder` | IMPLEMENTED_MATCH |
| MW05 | MW05-02 Add Content Block | `64bc636a34404cff81e28e61acf688e7` | Desktop | Add block dialog (heading, text, buttons, image, image+text) | IMPLEMENTED_MATCH |
| MW05 | MW05-03 Block Settings | `e15bf9d40eae4bbfbcb4bb8a25a067d8` | Desktop | inline block form on builder | IMPLEMENTED_WITH_MINOR_VARIANCE |
| MW05 | MW05-04 Mobile Page Builder | `44fca098452342a89255f9c9cd3cc9c9` | Mobile | same builder, responsive | IMPLEMENTED_WITH_MINOR_VARIANCE |
| MW06 | MW06-01 Media Library | `6032ae29163940f2847099b69e21c001` | Desktop | `/app/settings/website/media` | IMPLEMENTED_MATCH |
| MW06 | MW06-02 Upload Media | `1328c4524fda4a7a9de1c409633be399` | Desktop | library upload form | IMPLEMENTED_MATCH |
| MW06 | MW06-03 Select Media | `fe0d81b72c5d483a85cd1011462af9c0` | Desktop | builder picker + `?select=1` | IMPLEMENTED_WITH_MINOR_VARIANCE |
| MW06 | MW06-04 Media Details | `451748f8ee4b48ecb16c29137adb043d` | Desktop | `/app/settings/website/media/:id` | IMPLEMENTED_MATCH |
| MW07 | MW07-01 Site Status & Publishing | `48a4b01abbf14eaca2265e7ab4b05e1e` | Desktop | `/app/settings/website/publish` | IMPLEMENTED_MATCH |
| MW07 | MW07-02 Version History | `22fc73d39ad846a3aa6db72f13862def` | Desktop | existing `/clinics/:key/website/history` | IMPLEMENTED_WITH_MINOR_VARIANCE |
| MW07 | MW07-03 Publishing Confirmation | `c2c22334084c4944af49d436e0872a88` | Desktop | browser confirm before publish | IMPLEMENTED_WITH_MINOR_VARIANCE |
| MW07 | MW07-04 Mobile Publishing | `f0cc5328778e4bd987429652f16cdb35` | Mobile | publish page responsive | IMPLEMENTED_WITH_MINOR_VARIANCE |
| MW08 | — | — | — | No Stitch screens | NOT_APPLICABLE |
| MW09 | — | — | — | No Stitch screens | NOT_APPLICABLE |
| MW10 | — | — | — | Hub implemented on `/app/settings/website` without a Stitch screen | NOT_APPLICABLE |
| N/A | active-clinic-03-desktop-login | `2bfbc9c71ad64bfca245d9e1a26f837d` | Desktop | out of scope | NOT_APPLICABLE |
| N/A | active-clinic-03-mobile-login | `edb81abfe548470db687f343186ff786` | Mobile | out of scope | NOT_APPLICABLE |
| N/A | active-clinic-03-desktop-multi-clinic-selector | `df566a9cd85e4583b019363ca2104b00` | Desktop | out of scope | NOT_APPLICABLE |
| N/A | active-clinic-03-mobile-multi-clinic-selector | `ef782bd739854150b5b30ea4525c50c6` | Mobile | out of scope | NOT_APPLICABLE |
| N/A | active-clinic-03-desktop-validation-error | `f300be014a6148329910762c0b2970c8` | Desktop | out of scope | NOT_APPLICABLE |
| N/A | active-clinic-03-mobile-validation-error | `236850040de8488c9627970faad74b62` | Mobile | out of scope | NOT_APPLICABLE |
| N/A | active-clinic-03-loading-signing-in | `5adaedd9e29e48cc82b47dc3ac913383` | Desktop | out of scope | NOT_APPLICABLE |

## Variances

- Public clinic website keeps the existing ActiveClinic public typeface (Public Sans) from the public/booking Stitch project. CMS admin screens use Inter + teal from this project.
- Block settings are an in-page form, not a separate full-screen settings layout.
- Publish confirmation uses a native confirm dialog rather than a dedicated confirmation route.
- Version history reuses the existing shared website history UI.
- MW08 branding/settings, MW09 reusable collections, and MW10 hub were **not generated** in Stitch. The existing website hub was extended with CMS links without inventing those screens.

## Architecture

Pages, sections, and blocks are stored as structured keys (`cms.pages`, `cms.sections`, `cms.blocks`) on the shared V7 website engine. No second CMS schema.
