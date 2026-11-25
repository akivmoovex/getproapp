# G193 baseline

Branch `V13`. Expected base `232e54cb95abef61aeb67fc0e66fc5d1a4ef7c4a`. Worktree `/Users/akivsolomon/Development/getproapp-v13`. Product version stays `2.13.2` for BlessBoard and ActiveClinic.

The file `ActiveClinic_Community_Benefits_Product_Technical_QA_Specification_v1_2(1).pdf` was not in the worktree, the Cursor workspace, or the home directory. This cycle uses only the requirements reproduced in the G193–G210 prompt. Missing specification text was not invented. The figure 190 is a planning inventory, not a list of concrete cases.

Community Benefits is new work. Existing reception and billing tests are not evidence that it works.

Preserved baseline: OTP shared store, AC-05, D25 overlap, disabled public booking, disabled production media uploads, disabled production OTP. D14C, D16, and D25 slot stay failing. `docs/qa/V2132_G181_OTP_CHALLENGES.sql` was not executed. `db/migrations/platform/048_otp_challenges.sql` was not created.

Disposable database remains `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301`. New community tables are not authorized there. Port 5432 was not used.
