# Evidence-linked encounter draft smoke test

**November 15, 2026 · One fictional encounter · Local inference**

The locally running model was `mlx-community/Qwen3.5-4B-4bit`, revision `0e7ffd5c629ef7719d4cbc04069232580bfa9d9c`, with no adapter. The [fictional Morgan Lee script](../../src/lib/encounter-transcript.ts) matched all seven turn IDs, speakers, and quotes on the model service. The SHA-256 of the ordered JSON array of IDs, speakers, and quotes was `acf1b7fe7cf8f687bba776465787407a167c04838efcfa498f5614b1f2aebb99`.

From **Home → Read encounter → Draft from transcript**, the [app endpoint](../../src/app/api/encounter-note/route.ts) returned HTTP 200 with the following result at each tested width.

```json
{
  "selectedIds": ["t04", "t05", "t06"],
  "model": "mlx-community/Qwen3.5-4B-4bit",
  "revision": "0e7ffd5c629ef7719d4cbc04069232580bfa9d9c",
  "run": "local"
}
```

| Viewport and input | Browser observation |
| --- | --- |
| 1440 px, keyboard | Showed the local model label, partial draft status and exact source excerpts. Opened `#encounter-t04` using Enter. |
| 768 px, touch with reduced motion | Showed the same result and opened the source on tap. |
| 390 px, touch | Showed the same result and opened the source on tap. |

The model selected the discharge discussion, the question about aspirin and the clinician’s uncertainty. It omitted the prior medication list and the patient’s confirmation (`t02` and `t03`). The [draft panel](../../src/components/EncounterNoteDraft.tsx) flagged the omissions and linked to both timestamps. These observations cover one fixed fictional transcript and do not establish clinical accuracy or performance on the hosted runtime.
