# D58 final report

Six behavior changes were tried only in a sandbox copy. Five failed the existing D57 test. The duplicate-payment condition survived that test because the test returns before the branch. A new source guard now fails when that condition is inverted. It still does not execute the duplicate return.

The worktree copies of the mutated files kept their original hashes. No database write, commit, or push was made.
