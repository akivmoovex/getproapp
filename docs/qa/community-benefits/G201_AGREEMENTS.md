# G201 agreements

`createAgreement` stores `INACTIVE`, currency `ZMW`, and legal approval `unapproved`. Models are `MODEL_A_DIRECT_DISCOUNT`, `MODEL_B_COMMUNITY_CONTRIBUTION`, and `MODEL_C_HYBRID`. Rates are basis points. Amounts are integer ngwee.

Synthetic K1,000 is 100000 ngwee. Model A at 1000 basis points yields a 10000 ngwee discount and 90000 ngwee payable. Model B yields no patient discount and a 10000 ngwee contribution. Model C uses the configured rates: a 500 basis-point discount on 100000 ngwee is 5000, and a 1000 basis-point contribution on the remainder is 9500. These figures are calculator tests. No clinic agreement is active by default.
