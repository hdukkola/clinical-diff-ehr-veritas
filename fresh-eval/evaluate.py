"""Experimental synthetic single-note extraction; no clinical use."""
import argparse, hashlib, json, re, urllib.request
from collections import Counter
from pathlib import Path

DATASET = 'oopere/clinical-ner-qdora'
REVISION = '5d3b7dabed4b96aa4f62051ada2337b4b7aec0b5'
MODEL = 'mlx-community/Qwen3.5-4B-4bit'
SYSTEM = 'Extract medication names explicitly mentioned in this fictional note. Return only a JSON object with a medications array of strings. Do not infer medications.'

def get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.read()

def norm(value):
    return re.sub(r'\s+', ' ', value.casefold()).strip(' \t\n\r.,;:()[]{}\"\'')

def score(reference, predicted):
    expected = Counter(filter(None, (norm(x) for x in reference)))
    actual = Counter(filter(None, (norm(x) for x in predicted)))
    tp = sum((expected & actual).values())
    return {'tp': tp, 'fp': sum(actual.values()) - tp, 'fn': sum(expected.values()) - tp}

def parse_names(response):
    try:
        obj = json.loads(response.strip())
        names = obj['medications']
        if not isinstance(names, list) or not all(isinstance(x, str) for x in names):
            raise ValueError('medications must be an array of strings')
        return names, None
    except (ValueError, KeyError, TypeError) as exc:
        return [], str(exc)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='fresh-eval/results.json')
    args = parser.parse_args()
    metadata = json.loads(get('https://huggingface.co/api/datasets/' + DATASET))
    if metadata['sha'] != REVISION:
        raise SystemExit('Dataset revision changed; stop and pin a dataset-server snapshot before evaluating.')
    raw = get('https://datasets-server.huggingface.co/rows?dataset=oopere%2Fclinical-ner-qdora&config=default&split=test&offset=0&length=100')
    payload = json.loads(raw)
    rows = payload['rows']
    if len(rows) != 40 or payload.get('num_rows_total') != 40:
        raise SystemExit('Unexpected test set size; refusing to continue.')
    from mlx_lm import load, generate
    model, tokenizer = load(MODEL)
    from mlx_lm.sample_utils import make_sampler
    results = []
    for item in rows:
        row = item['row']
        gold = json.loads(row['label'])
        reference = [x['name'] for x in gold['medications'] if x.get('name')]
        messages = [{'role':'system','content':SYSTEM},{'role':'user','content':row['note']}]
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
        response = generate(model, tokenizer, prompt=prompt, max_tokens=128, sampler=make_sampler(temp=0), verbose=False)
        predicted, error = parse_names(response)
        results.append({'row_idx':item['row_idx'], 'category':row['category'], 'reference':reference, 'prediction':predicted, 'response':response, 'parse_error':error, 'baseline':score(reference, []), 'model':score(reference, predicted)})
        print(f"{len(results)}/{len(rows)}", flush=True)
    meta_after = json.loads(get('https://huggingface.co/api/datasets/' + DATASET))
    if meta_after['sha'] != REVISION:
        raise SystemExit('Dataset revision changed during evaluation; do not use these results.')
    summary = {}
    for method in ('baseline','model'):
        totals = {key:sum(r[method][key] for r in results) for key in ('tp','fp','fn')}
        totals['precision'] = totals['tp'] / (totals['tp'] + totals['fp']) if totals['tp'] + totals['fp'] else None
        totals['recall'] = totals['tp'] / (totals['tp'] + totals['fn']) if totals['tp'] + totals['fn'] else None
        summary[method] = totals
    out = {'dataset':DATASET,'revision':REVISION,'raw_json_sha256':hashlib.sha256(raw).hexdigest(),'model':MODEL,'n_notes':len(rows),'parse_failures':sum(r['parse_error'] is not None for r in results),'summary':summary,'results':results}
    Path(args.output).write_text(json.dumps(out, indent=2)+'\n')
    print(json.dumps({k:out[k] for k in ('n_notes','parse_failures','summary')}, indent=2))

if __name__ == '__main__': main()
