# Financial transaction tests

The D89 contract checks the reverse permission, `duplicate_submission`, and `already_reversed`. The D75 unit tests still cover a retry that keeps the stored amount of 2500 and a second reversal that returns `already_reversed`.

Those tests use fake databases. They do not open a transaction on a server. G2 payment rollback remains `NOT_RUN`.
