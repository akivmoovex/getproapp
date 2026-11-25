# G158 BlessBoard content coverage

Both Playwright cycles passed the content journeys. HTTP counterparts passed in both HTTP runs.

| Content | Create | Private draft | Publish | Public read | Other church |
| --- | --- | --- | --- | --- | --- |
| Homepage section | yes | yes | yes | yes | isolated in HTTP |
| Sermon | yes | yes | yes | yes | hidden |
| Event | yes | yes | yes | yes | hidden |
| Announcement | yes | yes | yes | yes | hidden |
| Theme | yes | preview | publish | applied | clinic theme rejected |
| Attachment | control present | upload refused | text publishes | filename absent | hidden |

A successful save is not treated as publication. Each live item is read on the public path after publish. Draft titles are absent from the public path.

Media upload stays disabled. The attachment test sets a PNG and asserts the status says uploads are off and the asset id is empty. Prayer-request submission is a member-portal category route. This cycle did not add a new prayer-request browser journey; the public contact enquiry journey passed.
