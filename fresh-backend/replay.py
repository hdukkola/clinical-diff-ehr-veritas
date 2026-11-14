"""Deterministic demo replay for fixed fictional fixtures only; not live AI."""
from __future__ import annotations

# Exact fixture inputs accepted when CLINICAL_DIFF_REPLAY is enabled.
# No dates: this service does not invent encounter or recording timestamps.
EARLIER_SOURCE_ID = 'fixture-earlier'
LATER_SOURCE_ID = 'fixture-later'

EARLIER_TEXT = (
    'Fictional outpatient medication list for a demo patient. '
    'The note explicitly lists Lisinopril, Metformin, and Aspirin.'
)
LATER_TEXT = (
    'Fictional discharge medication list for a demo patient. '
    'The note explicitly lists Lisinopril, Metformin, and Atorvastatin.'
)

FIXTURE_PAYLOAD = {
    'synthetic_only': True,
    'earlier': {'source_id': EARLIER_SOURCE_ID, 'text': EARLIER_TEXT},
    'later': {'source_id': LATER_SOURCE_ID, 'text': LATER_TEXT},
}

# Fixed extractor strings for those notes only; never used for other inputs.
_FIXTURE_OUTPUTS = {
    EARLIER_TEXT: '{"medications":["Lisinopril","Metformin","Aspirin"]}',
    LATER_TEXT: '{"medications":["Lisinopril","Metformin","Atorvastatin"]}',
}

REPLAY_NOTICE = (
    'Simulated deterministic demo replay; not live AI inference. '
    'Fictional fixture notes only; not clinically validated.'
)

REPLAY_LIMITATIONS = [
    'This response is a simulated deterministic replay of fixed fixtures, not live model output.',
    'Fixture differences are illustrative name-mention mismatches only; they are not errors, '
    'omissions, discontinuations, or clinically validated findings.',
]


def replay_enabled(environ=None):
    import os
    env = os.environ if environ is None else environ
    return env.get('CLINICAL_DIFF_REPLAY', '').strip().lower() in {'1', 'true', 'yes', 'on'}


def validate_replay_payload(payload):
    """Accept only the fixed fictional fixture pair; reject all other inputs."""
    earlier = payload.get('earlier') if isinstance(payload, dict) else None
    later = payload.get('later') if isinstance(payload, dict) else None
    if not isinstance(earlier, dict) or not isinstance(later, dict):
        raise ValueError(
            'Replay mode accepts only the fixed fictional fixture notes documented in the README.'
        )
    if (set(payload) != {'synthetic_only', 'earlier', 'later'}
            or set(earlier) != {'source_id', 'text'}
            or set(later) != {'source_id', 'text'}):
        raise ValueError('Replay mode accepts only the exact fixed fixture payload.')
    if (earlier.get('source_id') != EARLIER_SOURCE_ID
            or earlier.get('text') != EARLIER_TEXT
            or later.get('source_id') != LATER_SOURCE_ID
            or later.get('text') != LATER_TEXT):
        raise ValueError(
            'Replay mode accepts only the fixed fictional fixture notes documented in the README.'
        )


class ReplayExtractor:
    """Returns canned JSON for fixture note text; rejects any other text."""

    def __call__(self, text):
        try:
            return _FIXTURE_OUTPUTS[text]
        except KeyError as exc:
            raise ValueError(
                'Replay mode accepts only the fixed fictional fixture notes documented in the README.'
            ) from exc


def label_replay_response(payload):
    """Visibly mark every replay response as simulated and not live AI."""
    if not isinstance(payload, dict):
        return payload
    labeled = dict(payload)
    labeled['simulated'] = True
    labeled['live_ai'] = False
    labeled['mode'] = 'deterministic_replay'
    labeled['notice'] = REPLAY_NOTICE
    if 'disclaimer' in labeled and isinstance(labeled['disclaimer'], str):
        if REPLAY_NOTICE not in labeled['disclaimer']:
            labeled['disclaimer'] = f"{labeled['disclaimer']} {REPLAY_NOTICE}"
    limitations = labeled.get('limitations')
    if isinstance(limitations, list):
        labeled['limitations'] = list(limitations) + [
            item for item in REPLAY_LIMITATIONS if item not in limitations
        ]
    return labeled
