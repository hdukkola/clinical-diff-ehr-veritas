# Discharge review usability check

Measure whether a reviewer can identify an unresolved medication and draft a source-backed question faster with Clinical Diff than with the two source notes alone. Use fictional notes and ask the reviewer to record a question for the discharging team. The task ends when they have a question and its source, without making a treatment decision.

## Setup

- Use one case with both notes visible as plain text, then a different case in Clinical Diff. Alternate the case and interface order across reviewers. Hide the expected answer until each task ends.
- Start timing when the notes appear. Stop when the reviewer presents their handoff question. Include inference load or response delay in the app time and record whether this was the first comparison since startup. In the app, provide the local inference mode and leave the comparison button for the reviewer to use.
- Record elapsed seconds, whether the correct item was flagged, whether the cited text supported the question, and any extraneous or missed flags. Note any claim that a medication was stopped or started without explicit evidence. Record whether the plain-text download carried the question and source excerpt.
- Report counts and individual times. Keep observed errors alongside timing. This small check tests the workflow and cannot estimate clinical accuracy.

## Fictional cases

| Case | Earlier note | Discharge note | Expected question |
| --- | --- | --- | --- |
| A | Fictional outpatient medication list. The note explicitly lists Lisinopril, Metformin, and Aspirin. | Fictional discharge medication list. The note explicitly lists Lisinopril, Metformin, and Atorvastatin. The clinician documented that Atorvastatin was added. | Clarify whether Aspirin belongs on the discharge list. Cite the earlier Aspirin mention and recognize that the record gives no reason for its absence. The Atorvastatin addition has explicit documentation. |
| B | Fictional outpatient medication list. The note explicitly lists Losartan, Amlodipine, and Albuterol. | Fictional discharge medication list. The note explicitly lists Losartan, Albuterol, and Cetirizine. The clinician documented that Cetirizine was added. | Clarify whether Amlodipine belongs on the discharge list. Cite the earlier Amlodipine mention and recognize that the record gives no reason for its absence. The Cetirizine addition has explicit documentation. |

The comparison detects mentions. Correctly using an explanation such as “the clinician documented that it was added” is part of the reviewer's task. Clinical Diff's suggested question does not classify that explanation.

Both fixture pairs were rehearsed against the local 4B inference service. It returned the earlier-only and later-only mentions expected for each. Human review times and decisions remain to be measured.
