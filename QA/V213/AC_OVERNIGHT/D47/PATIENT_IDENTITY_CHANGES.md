# Patient identity changes

Staff still create the patient. Portal registration is still optional. A phone match still requires the caller’s organization and healthcare organization before any patient query, and a non-UUID clinic id still returns `invalid_input` before that query. An exact national-identifier duplicate still blocks. Nothing is auto-merged.

A patient password reset now reads `organization_id` from the existing token row. A token whose clinic is not the clinic in the request returns `token_invalid` and does not change the password. A missing clinic id returns `invalid_input` before a query. The public registration messages were not collapsed. The D24 contract still requires the separate account, no-match, and multiple-record sentences. Login still uses one failure sentence.
