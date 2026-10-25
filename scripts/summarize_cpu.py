"""Summarize CPU samples from wrangler tail JSON without printing credentials."""

import json
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

text = Path(sys.argv[1]).read_text()
decoder = json.JSONDecoder()
samples = defaultdict(list)
outcomes = defaultdict(list)
while text.strip():
    item, end = decoder.raw_decode(text.lstrip())
    text = text.lstrip()[end:]
    url = urlsplit(item.get('event', {}).get('request', {}).get('url', ''))
    label = parse_qs(url.query).get('cpu_case', [url.path])[0]
    cpu = item.get('cpuTime')
    if isinstance(cpu, (int, float)):
        samples[label].append(cpu)
        outcomes[label].append(item.get('outcome'))
display_prefix = sys.argv[sys.argv.index('--prefix') + 1] if '--prefix' in sys.argv else ''
for label, values in sorted(samples.items()):
    if not label.startswith(display_prefix):
        continue
    values.sort()
    p95 = values[min(len(values) - 1, int(len(values) * .95))]
    p50 = values[len(values) // 2]
    print(f'{label}: n={len(values)}, CPU min={values[0]}, p50={p50}, p95={p95}, max={values[-1]} ms')
if '--assert-warm-max' in sys.argv:
    limit = float(sys.argv[sys.argv.index('--assert-warm-max') + 1])
    prefix = sys.argv[sys.argv.index('--prefix') + 1] if '--prefix' in sys.argv else ''
    for label in ('api-warm', 'editor-warm', 'subscription-warm'):
        label = prefix + label
        assert len(samples[label]) >= 20, f'Insufficient samples for {label}'
        assert max(samples[label]) <= limit, f'{label} exceeded {limit} ms CPU'
    print(f'PASS: observed warm-request CPU samples <= {limit:g} ms; this is not a universal guarantee')
if '--assert-labeled-max' in sys.argv:
    limit = float(sys.argv[sys.argv.index('--assert-labeled-max') + 1])
    prefix = sys.argv[sys.argv.index('--prefix') + 1] if '--prefix' in sys.argv else ''
    selected = {label: values for label, values in samples.items() if label.startswith(prefix)}
    assert len(selected) >= 20, 'Insufficient labeled boundary cases'
    for label, values in selected.items():
        assert max(values) <= limit, f'{label} exceeded {limit} ms CPU'
        assert all(outcome == 'ok' for outcome in outcomes[label]), f'{label} had an execution failure'
    print(f'PASS: all {sum(map(len, selected.values()))} observed labeled requests <= {limit:g} ms CPU')
