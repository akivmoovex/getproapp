# V2134 G334 64-scenario reconciliation

ORIGINAL_DOCX_THIS_SESSION=NOT_INSPECTED  
SOURCE=G324, G325, and G331 matrices  
QA_TOTAL=64  
QA_LOCAL_PASS=60  
QA_LOCAL_FAIL=0  
QA_HOSTED_PASS=0  
QA_HOSTED_NOT_RUN=64  
QA_POLICY_EXCEPTIONS=3

The 48 historical passes and the later local closures for the supported fail rows were exercised again by the suites that passed twice: contract 697, HTTP 41, ActiveClinic browser 36, BlessBoard browser 23, and the OTP browser files. This is local evidence. It is not Christine's hosted acceptance run.

| Row | Local | Hosted | Decision |
| --- | --- | --- | --- |
| RT-01 to RT-02, RT-04 to RT-06, RT-09 to RT-29 except RT-28 and RT-29, RT-34 to RT-55, RT-61 to RT-63 | Covered by the passing local suites | NOT_RUN | Historical pass, local pass |
| RT-03 | AC-PUB-01 denial passed twice | NOT_RUN | Policy keeps booking disabled |
| RT-07 | Mock provider passed. No mailbox | NOT_RUN | Provider blocked |
| RT-08 | SMS stays failed closed | NOT_RUN | Policy keeps SMS off |
| RT-28, RT-29 | Text and image sections passed twice, including 390, 768, and 1440 | NOT_RUN | Local fix, hosted retest |
| RT-30, RT-32, RT-33 | Activation and the correct portal passed twice | NOT_RUN | Local fix, hosted retest |
| RT-31 | Unmatched registration creates no chart | NOT_RUN | Chart-first product decision |
| RT-44 | Vital correction passed twice | NOT_RUN | Local fix, hosted retest |
| RT-56 to RT-60 | Laboratory and radiology workflows passed twice | NOT_RUN | Local fix, hosted retest |
| RT-64 | Print regions in the clinical browser tests passed twice | NOT_RUN | Local fix, hosted retest |

G325 had already closed the earlier local gaps for multi-clinic selection, website upload, catalogue details, and follow-up text. Those cases are inside the ActiveClinic browser file that passed 36/36 twice. They were not repeated as a separate hosted walkthrough.
