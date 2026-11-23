# V13 G95 BlessBoard regression

HTTP results on the latest two complete runs:

| ID | HTTP | Browser |
| --- | --- | --- |
| BB-REG-07 | Pass | Still failing |
| BB-AUTH-04 | Pass | Still requires `E2E_BB_MEMBER_OTP` |
| BB-MEM-01 | Pass | Still failing |
| BB-MEM-02 | Pass | Still failing |
| BB-WEB-08 | Pass | Still failing |
| BB-WEB-09 | Pass | Public marker still missing |
| BB-WEB-10 | Pass | Public marker still missing |
| BB-ANN-01 | Pass | Public marker still missing |
| BB-ANN-02 | Pass as 403 `media_uploads_disabled` | Upload journey still fails |

The theme HTTP test publishes only after the synthetic church has an office email and the required public pages. Media uploads stay disabled. Production OTP was not enabled.

The browser homepage tests now open `/hq/content/pages/home`, which is the current section editor. They still fail because the saved heading is not visible. Public browser pages still render the unpublished setup page for the original fixture church.
