# ActiveClinic Stitch — P26

**Re-audited:** 2026-08-04 (completion run)  
**Exact phase label:** `P26`  
**Stitch stability:** STABLE  
**Live screen count:** 35 (see `_p21_p27_live_inventory.json`)  
**Desktop / Mobile:** 16 / 19  
**Implementation status:** COMPLETE_WITH_DOCUMENTED_PRODUCT_GAPS (visual FUNCTIONAL_ONLY)  
**Notes:** Lookup + cancel/reschedule request flows; status-gated  
**Companion reports:** `ACTIVECLINIC_STITCH_P21_TO_P27_MISSING_SCREEN_AUDIT.md`, `ACTIVECLINIC_STITCH_P21_TO_P27_COMPLETION_REPORT.md`, `ACTIVECLINIC_STITCH_P21_TO_P27_VISUAL_PARITY_REPORT.md`

**Stitch design project:** `projects/17813606734422395399`  
**Clinical app project:** `projects/12272131183982732110` (zero P20–P27 screens)

## Live screens

| Exact Stitch name | Screen ID | Form | WxH |
|-------------------|-----------|------|-----|
| P26 - Juflona Booking - Booking Activity Pattern - Desktop | `e1a9a3b347b74171848d5639eaf48694` | DESKTOP | 2560x2048 |
| P26 - Juflona Booking - Booking Changed During Request - Mobile | `ca7cdd02f84f4a13abb5b324f3fb453f` | MOBILE | 780x1768 |
| P26 - Juflona Booking - Booking Detail Cancelled - Desktop | `df011954ab5248cfb5126f49d6187258` | DESKTOP | 2560x2048 |
| P26 - Juflona Booking - Booking Detail Cancelled - Mobile | `48a852ead3284e44b9700df8a8875167` | MOBILE | 780x1774 |
| P26 - Juflona Booking - Booking Detail Completed - Desktop | `a0d78f650671453594236ad0ad1f727f` | DESKTOP | 2560x2048 |
| P26 - Juflona Booking - Booking Detail Completed - Mobile | `bbe2c7c3fdf442b397ee457e287b1674` | MOBILE | 780x1814 |
| P26 - Juflona Booking - Booking Detail Confirmed - Desktop | `36db01f8f7d741a8ad3b91536834ab10` | DESKTOP | 2560x2186 |
| P26 - Juflona Booking - Booking Detail Confirmed - Mobile | `5511e7ced0094007b300f58665fc9ccd` | MOBILE | 780x1768 |
| P26 - Juflona Booking - Booking Detail No-show - Desktop | `0a244c1b24f140368509e4f6f014a9fe` | DESKTOP | 2560x2048 |
| P26 - Juflona Booking - Booking Detail No-show - Mobile | `e712f1d474024445899b4014f1d5c977` | MOBILE | 780x1768 |
| P26 - Juflona Booking - Booking Detail Pending - Desktop | `3b311f353e1745c0b020b400af92b0f5` | DESKTOP | 2560x2048 |
| P26 - Juflona Booking - Booking Detail Pending - Mobile | `df7614f5b31347d4b3dff81928e5eadc` | MOBILE | 780x2460 |
| P26 - Juflona Booking - Booking Detail Rescheduled - Desktop | `8e3e9337e8404c38b4f3e1dacdc7ba9c` | DESKTOP | 2560x2156 |
| P26 - Juflona Booking - Booking Detail Rescheduled - Mobile | `189043d6d06d4819b06ea42e22e10035` | MOBILE | 780x1768 |
| P26 - Juflona Booking - Booking Status Patterns - Desktop | `b18ffbdac9a644f8bea30734fc9368df` | DESKTOP | 2560x2132 |
| P26 - Juflona Booking - Cancellation Request - Desktop | `766528bda7e548ac93d381129023802f` | DESKTOP | 2560x2142 |
| P26 - Juflona Booking - Cancellation Request - Mobile | `81d1f26454324356b25cfec1db745491` | MOBILE | 780x1838 |
| P26 - Juflona Booking - Cancellation Review - Desktop | `4685ca7800dd477faa561270dfe01cba` | DESKTOP | 2560x2048 |
| P26 - Juflona Booking - Cancellation Review - Mobile | `3be2c468e5e24ae592feb7c8b264b098` | MOBILE | 780x1768 |
| P26 - Juflona Booking - Cancellation Submitted - Desktop | `f510ec7d017e426e86e801932011d346` | DESKTOP | 2560x2196 |
| P26 - Juflona Booking - Cancellation Submitted - Mobile | `f30239e9267242c0af4dfbaf44bb2d20` | MOBILE | 780x2218 |
| P26 - Juflona Booking - Change Request States - Mobile | `7b7546940db743839e4c4b11ae366dda` | MOBILE | 780x2548 |
| P26 - Juflona Booking - Lookup Error States - Mobile | `e4fa5d144ebb46cea06c4ef3a3af3e7b` | MOBILE | 780x4492 |
| P26 - Juflona Booking - Lookup Progress - Mobile | `ab96f1f72f444e9e943a1e6b2d539b46` | MOBILE | 780x1768 |
| P26 - Juflona Booking - Mobile Booking Summary Pattern - Mobile | `8f9a5650ff3d4f7482de4f82bcee597b` | MOBILE | 780x1768 |
| P26 - Juflona Booking - My Booking - Desktop | `a8ad8c9b489149d592cd9ca53a525e14` | DESKTOP | 2560x2048 |
| P26 - Juflona Booking - My Booking - Mobile | `a2b5c7ddfddc4c80a1ddb035748da72f` | MOBILE | 780x2050 |
| P26 - Juflona Booking - Pending Preference Change - Mobile | `4e84a1501ffa454b91221a4f32cfaabb` | MOBILE | 780x1868 |
| P26 - Juflona Booking - Privacy and Lookup Rules - Desktop | `e50e9dfeaf1a405bbf3f3c334ebbe039` | DESKTOP | 2560x2178 |
| P26 - Juflona Booking - Reschedule Request - Desktop | `97540ef2e0244f97a2974c50835276c3` | DESKTOP | 2560x2872 |
| P26 - Juflona Booking - Reschedule Request - Mobile | `c016257b490d42ccb49bdb01e4228c2f` | MOBILE | 780x1868 |
| P26 - Juflona Booking - Reschedule Review - Desktop | `d968e9e9008d4987a5c4cdba86ab9a95` | DESKTOP | 2560x2048 |
| P26 - Juflona Booking - Reschedule Review - Mobile | `15321bc4c76f4c08b61e59972aa7d44f` | MOBILE | 780x1768 |
| P26 - Juflona Booking - Reschedule Submitted - Desktop | `ba51a076b8ed49e0b4761f3068b56e41` | DESKTOP | 2560x2048 |
| P26 - Juflona Booking - Reschedule Submitted - Mobile | `684f5190840549698bd9237caedeccb3` | MOBILE | 780x2098 |

---

## Prior inventory notes

Previous doc header preserved in git history. Prior incomplete counts are superseded by live inventory above.
