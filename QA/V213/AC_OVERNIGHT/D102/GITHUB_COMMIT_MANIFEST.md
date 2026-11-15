# Git commit manifest

Nothing is staged. This is the proposed set if a later message asks for a commit. Do not use `git add -A`.

| Path | State | Why it belongs |
|---|---|---|
| `.github/workflows/v13-ac-qa-regression.yml` | Modified | Quotes the six hold echoes. Does not add `push` |
| `.github/workflows/v13-platform-qa-regression.yml` | Modified | Same quote fix |
| Ten files under `tests/v13/unit` and `tests/v13/contract` from D86 through D98 | Untracked | G1 assertions, including the YAML regression |
| `QA/V213/AC_OVERNIGHT/D80` through `D102` | Untracked | Stage reports |

`src` is unchanged. No migration is included. A push of this set, without a `push` trigger, does not start Stage A. Origin would still need the quoted files before GitHub can parse the two workflows. Push is not requested here.
