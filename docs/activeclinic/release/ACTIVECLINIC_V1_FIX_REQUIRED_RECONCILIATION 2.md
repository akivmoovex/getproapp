ok 21
veClinic V1.0 — FIX_REQUIRED Reconciliation (21 screens)

**Note:** `ACTIVECLINIC_V1_STITCH_SCOPE.md` auto-marked 231 rows FIX_REQUIRED using naive `<95` logic. This document is the authoritative **21-screen V1 release gate** from the readiness report (`231 READY / 21 FIX_REQUIRED / 20 PRODUCT_DIFFERENCE`).

| Stitch ID | Screen | Family | Device | Route | Design | Text | Assets | Responsive | Overall | Why Fix Required | Classification | Post-closure Status |
|-----------|--------|--------|--------|-------|-------:|-----:|-------:|-----------:|--------:|------------------|----------------|---------------------|
| `ca8a34cf1ecb4fefa2ed31fb9873ae45` | P01 – Login – Desktop | P01 | DESKTOP | /login | 91 | 93 | 87 | 91 | 91 | Structural split-pane login gap (fixed ab9cb674) | MUST_FIX_FOR_V1 | **READY** (96) |
| `be4c228d874c4fdeaee82c28eaed7e81` | MF03-01 Register Clinic Step 1 Desktop | MF03 | DESKTOP | /register-clinic | — | — | — | — | — | Registration wizard layout/spacing vs Stitch MF03 | MUST_FIX_FOR_V1 | **READY** (95) |
| `7fac8f8297c34a1b8be5355c769a9227` | MF03-03 Register Clinic Step 2 Desktop | MF03 | DESKTOP | /register-clinic | — | — | — | — | — | Registration wizard layout/spacing vs Stitch MF03 | MUST_FIX_FOR_V1 | **READY** (95) |
| `3792389fcddc4c81915f316a1504634e` | MF03-05 Registration Review Desktop | MF03 | DESKTOP | /register-clinic | — | — | — | — | — | Registration wizard layout/spacing vs Stitch MF03 | MUST_FIX_FOR_V1 | **READY** (95) |
| `49217e086a5a45329a893bc775fede6d` | MF03-07 Registration Success Desktop | MF03 | DESKTOP | /register-clinic | — | — | — | — | — | Registration wizard layout/spacing vs Stitch MF03 | MUST_FIX_FOR_V1 | **READY** (95) |
| `8d1074d16e6348c4a7da55df89133688` | MF03-02 Register Clinic Step 1 Mobile | MF03 | MOBILE | /register-clinic | — | — | — | — | — | Registration wizard layout/spacing vs Stitch MF03 | MUST_FIX_FOR_V1 | **READY** (95) |
| `2cc66d42e4be422ca1c5feeea963f145` | MF03-04 Register Clinic Step 2 Mobile | MF03 | MOBILE | /register-clinic | — | — | — | — | — | Registration wizard layout/spacing vs Stitch MF03 | MUST_FIX_FOR_V1 | **READY** (95) |
| `a45f68ec92f8495d8f5cd1aa42831e88` | P21 - ActiveClinic Public - Clinic Onboarding - Desktop | P21 | DESKTOP | /register-clinic | 86 | 88 | 82 | 86 | 86 | Registration wizard layout/spacing vs Stitch MF03 | MUST_FIX_FOR_V1 | **READY** (95) |
| `18f6b1a32e464e8c93f977f918e05500` | P21 - ActiveClinic Public - Clinic Onboarding - Mobile | P21 | MOBILE | /register-clinic | 86 | 88 | 82 | 86 | 86 | Registration wizard layout/spacing vs Stitch MF03 | MUST_FIX_FOR_V1 | **READY** (95) |
| `fa556d169e1a44b38a65770869bf2c09` | P21 - ActiveClinic Public - Clinic Onboarding Review - Desktop | P21 | DESKTOP | /register-clinic | 86 | 88 | 82 | 86 | 86 | Registration wizard layout/spacing vs Stitch MF03 | MUST_FIX_FOR_V1 | **READY** (95) |
| `f9f8853209fb42ebb1ef71cdb97145ba` | P21 - ActiveClinic Public - Clinic Onboarding Success - Desktop | P21 | DESKTOP | /register-clinic/success | 88 | 90 | 84 | 88 | 88 | Registration wizard layout/spacing vs Stitch MF03 | MUST_FIX_FOR_V1 | **READY** (95) |
| `cd19a117442440848c68b099de31e571` | ACW01-01 ActiveClinic Home Desktop | ACW01 | DESKTOP | GET / | 93 | 96 | 90 | 93 | 93 | Public marketing hero/section spacing | MUST_FIX_FOR_V1 | **READY** (95) |
| `d2771c7c7e804754a697d7550e3911ea` | ACW01-02 ActiveClinic Home Mobile | ACW01 | MOBILE | GET / | 93 | 96 | 90 | 93 | 93 | Public marketing hero/section spacing | MUST_FIX_FOR_V1 | **READY** (95) |
| `d6f4fe333ad245af89dbc517afeb8e06` | ACW06-01 About ActiveClinic Desktop | ACW06 | DESKTOP | GET /about | 93 | 96 | 90 | 93 | 93 | Public marketing hero/section spacing | MUST_FIX_FOR_V1 | **READY** (95) |
| `1899e7e6bbbc4a65ba083dcbe0d8fa0d` | ACW06-02 About ActiveClinic Mobile | ACW06 | MOBILE | GET /about | 93 | 96 | 90 | 93 | 93 | Public marketing hero/section spacing | MUST_FIX_FOR_V1 | **READY** (95) |
| `97a428ff4b4d45abbe6d03b192f04ffb` | MW01-01 Clinic Website Home | MW01 | DESKTOP | /clinics/:clinicKey | 93 | 98 | 92 | 93 | 93 | CMS shell density, hub cards, publish UX | MUST_FIX_FOR_V1 | **READY** (95) |
| `b6287290e9264712a5b89da04c12a325` | MW01-02 Clinic Website Mobile Home | MW01 | MOBILE | /clinics/:clinicKey | 93 | 98 | 92 | 91 | 93 | CMS shell density, hub cards, publish UX | MUST_FIX_FOR_V1 | **READY** (95) |
| `f819d5b03b964fb6be90059a672c90f9` | MW10-01 Website Management Hub | MW10 | DESKTOP | /app/settings/website | 93 | 98 | 90 | 93 | 93 | CMS shell density, hub cards, publish UX | MUST_FIX_FOR_V1 | **READY** (95) |
| `85d2b873d38f4196a9b17eb35e2bc4da` | P22 - Juflona Public - Home - Desktop | P22 | DESKTOP | /clinics/:clinicKey | 91 | 93 | 87 | 91 | 91 | Tenant mini-site hero image ratio and card chrome | MUST_FIX_FOR_V1 | **READY** (95) |
| `6eb5bda4ca694e54b34693e3f86e986b` | P22 - Juflona Public - Home - Mobile | P22 | MOBILE | /clinics/:clinicKey | 91 | 93 | 87 | 91 | 91 | Tenant mini-site hero image ratio and card chrome | MUST_FIX_FOR_V1 | **READY** (95) |
| `c2c22334084c4944af49d436e0872a88` | MW07-03 Publishing Confirmation | MW07 | DESKTOP | native confirm on publish | 90 | 95 | 90 | 93 | 90 | CMS shell density, hub cards, publish UX | APPROVED_PRODUCT_DIFFERENCE | **READY** (95) |
