"""
Offline evaluation script for Qwen3.6-35B-A3B base model vs adapter.
Runs all 40 test cases against both models and scores results.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from datetime import datetime, timezone
from mlx_lm import load, generate
from mlx_lm.generate import make_sampler

BASE_MODEL_PATH = '/Users/himnishdukkola/.cache/huggingface/hub/models--mlx-community--Qwen3.6-35B-A3B-4bit/snapshots/38740b847e4cb78f352aba30aa41c76e08e6eb46'
ADAPTER_PATH = '/Users/himnishdukkola/.codex/.chatgpt-projects/g-p-6ae2a77388348191821395e8101c3408/model-development/local-35b-medication-v1/adapter'
TEST_JSON_PATH = '/Users/himnishdukkola/.codex/.chatgpt-projects/g-p-6ae2a77388348191821395e8101c3408/model-development/local-35b-medication-v1/evaluation/test.json'

SYSTEM_PROMPT = (
    'Extract medication names explicitly mentioned in this fictional note. '
    'Return only a JSON object with a medications array of strings. '
    'Do not infer or recommend medications.'
)
MAX_TOKENS = 300
TEMP = 0.0

print('Loading base model...')
model, tokenizer = load(BASE_MODEL_PATH)
print('Base model loaded')
print('Loading adapter...')
model_adapter, tokenizer_adapter = load(BASE_MODEL_PATH, adapter_path=ADAPTER_PATH)
print('Adapter loaded')

def run_model(model, tokenizer, note_text: str) -> str:
    prompt_formatted = tokenizer.apply_chat_template([
        {'role': 'system', 'content': SYSTEM_PROMPT},
        {'role': 'user', 'content': note_text}
    ], tokenize=False, add_generation_prompt=True)
    sampler = make_sampler(temp=TEMP, top_p=0.0)
    return generate(model, tokenizer, prompt=prompt_formatted, verbose=False, sampler=sampler, max_tokens=MAX_TOKENS)

def extract_json(raw: str) -> dict | None:
    m = re.search(r'\{[^{}]*"medications"[^{}]*\}', raw)
    if not m:
        m = re.search(r'\{.*?\}', raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return None

def eval_case(note_text: str, expected_raw: str, response: str) -> dict:
    result = {
        'strict_json_valid': False,
        'parse_mode': 'failed',
        'medication_pairs_match': 0,
        'expected_medications': 0,
        'dose_exact': 0,
    }
    
    try:
        expected = json.loads(expected_raw) if isinstance(expected_raw, str) else expected_raw
    except json.JSONDecodeError:
        result['parse_mode'] = 'expected_parse_fail'
        return result
    
    parsed = extract_json(response)
    if parsed is None:
        result['parse_mode'] = 'no_json'
        return result
    
    result['strict_json_valid'] = True
    result['parse_mode'] = 'strict'
    
    pred_meds = set()
    for m in parsed.get('medications', []):
        if isinstance(m, str):
            pred_meds.add(m.strip().casefold())
    
    exp_meds = set()
    exp_med_map = {}
    for m in expected.get('medications', []):
        if isinstance(m, dict):
            name = m.get('name', '').strip().casefold()
            exp_meds.add(name)
            exp_med_map[name] = m
        elif isinstance(m, str):
            name = m.strip().casefold()
            exp_meds.add(name)
            exp_med_map[name] = {'name': name}
    
    result['expected_medications'] = len(exp_meds)
    result['medication_pairs_match'] = len(pred_meds & exp_meds)
    
    pred_med_map = {}
    for m in parsed.get('medications', []):
        if isinstance(m, dict):
            pred_med_map[m.get('name', '').strip().casefold()] = m
    
    for med_name in pred_meds & exp_meds:
        pred_m = pred_med_map.get(med_name, {})
        exp_m = exp_med_map.get(med_name, {})
        if pred_m.get('dose') == exp_m.get('dose'):
            result['dose_exact'] += 1
    
    return result

def main():
    test_data = json.load(open(TEST_JSON_PATH))
    print(f'Total cases: {len(test_data)}')
    
    base_results = []
    adapter_results = []
    
    for i, (note_text, expected_raw) in enumerate(test_data):
        print(f'Case {i+1}/40', end=' ')
        
        b_resp = run_model(model, tokenizer, note_text)
        b_eval = eval_case(note_text, expected_raw, b_resp)
        base_results.append({'id': i, 'response': b_resp, 'eval': b_eval})
        
        a_resp = run_model(model_adapter, tokenizer_adapter, note_text)
        a_eval = eval_case(note_text, expected_raw, a_resp)
        adapter_results.append({'id': i, 'response': a_resp, 'eval': a_eval})
        
        print(f'base_strict={b_eval["strict_json_valid"]} pairs={b_eval["medication_pairs_match"]}/{b_eval["expected_medications"]} adapter_strict={a_eval["strict_json_valid"]} pairs={a_eval["medication_pairs_match"]}/{a_eval["expected_medications"]}')
    
    base_agg = {
        'total_cases': len(base_results),
        'strict_json_valid': sum(1 for r in base_results if r['eval']['strict_json_valid']),
        'total_expected_meds': sum(r['eval']['expected_medications'] for r in base_results),
        'total_matched_meds': sum(r['eval']['medication_pairs_match'] for r in base_results),
        'total_dose_exact': sum(r['eval']['dose_exact'] for r in base_results),
    }
    adapter_agg = {
        'total_cases': len(adapter_results),
        'strict_json_valid': sum(1 for r in adapter_results if r['eval']['strict_json_valid']),
        'total_expected_meds': sum(r['eval']['expected_medications'] for r in adapter_results),
        'total_matched_meds': sum(r['eval']['medication_pairs_match'] for r in adapter_results),
        'total_dose_exact': sum(r['eval']['dose_exact'] for r in adapter_results),
    }
    
    print('\n=== BASE MODEL ===')
    for k, v in base_agg.items():
        print(f'  {k}: {v}')
    print('\n--- ADAPTER MODEL ---')
    for k, v in adapter_agg.items():
        print(f'  {k}: {v}')
    
    output = {
        'base_results': base_results,
        'adapter_results': adapter_results,
        'base_aggregate': base_agg,
        'adapter_aggregate': adapter_agg,
        'evaluation_date': datetime.now(timezone.utc).isoformat(),
    }
    out_path = 'model-development/local-35b-medication-v1/evaluation/base_vs_adapter_results.json'
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f'\nResults saved to {out_path}')

if __name__ == '__main__':
    main()
