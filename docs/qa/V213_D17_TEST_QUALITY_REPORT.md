# V2.13 D17 test quality

Six mutations were applied to temporary copies outside the repository. The working tree was not edited for the experiment. A mutation is killed when the safe behavior no longer holds.

| Mutation | Detection | Result |
|---|---|---|
| Announcement visibility returns true for a draft | `isPubliclyVisible` assertion fails | KILLED |
| CTA prefix removed from the section pattern | CTA `buttonText` no longer resolves | KILLED |
| Event end-before-start check disabled | `buildEventFields` accepts the invalid range | KILLED |
| Enquiry uses the posted church id | Saved church becomes the other church | KILLED |
| Production fixed-code check disabled | Reason is no longer `testing_code_rejected` | KILLED |
| Cashier organisation-scope check disabled | Assignment no longer returns `invalid_scope` | KILLED |

`MUTATIONS_KILLED=6`. `MUTATIONS_SURVIVED=0` in this set. This is not a whole-repository mutation score.

Surviving product gaps the probes do not cover: branch sermon HTTP handler, appointment collision SQL, invitation first login, and live cross-tenant sessions. Those remain blocked or partial because exercising them needs the held database or browser path.
