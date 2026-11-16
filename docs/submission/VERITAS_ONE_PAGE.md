# DiffMD

**AI + Health · Himnish Dukkola and Utkarsh Valluri · Coppell High School**

Medication lists can change across visits, and the reason for a change may be buried in an earlier note. DiffMD compares two notes and takes reviewers to the supporting passages so they can check what changed and record what needs follow-up. [Live workspace](https://diffmd.web.app/)

Reviewers enter two de-identified notes, compare them, and open the source evidence for each difference. They can record their decision and export follow-up items. With permission, an invited reviewer can record a conversation. A hosted Whisper model transcribes it in sections as they speak. The reviewer checks the transcript, including any gaps, before adding it to a draft. The public comparison uses deterministic rules. A private Qwen 4B test workflow extracts medication names from prepared synthetic notes so we can evaluate that task separately. [Whisper](https://github.com/openai/whisper) · [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B)

In a local evaluation on 40 public synthetic notes, Qwen 4B matched 49 of 60 reference medication names, with 11 unmatched predictions and 11 missed names. Exact-name precision and recall were both **81.7%**. In a separate hosted run of 32 synthetic cases with the trained adapter, 31 passed on the first request. The remaining case timed out and passed on retry. The deterministic comparison engine passed **50,000 generated cases** in a separate engineering check. These tests measured extraction or rule behavior under the stated inputs. They did not measure clinical outcomes. All project evaluation records used public or synthetic data. [Evaluation dataset](https://huggingface.co/datasets/oopere/clinical-ner-qdora) · [Methods, results, and credits](VERITAS_CREDITS.md)

Himnish built and verified the workspace and transcript review workflow. Utkarsh implemented evidence navigation and widgets and contributed comparison edge-case tests. We used Codex, Antigravity and other development tools credited in our project records. [Team contributions and tool credits](VERITAS_CREDITS.md)
