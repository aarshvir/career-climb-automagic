"""Validate and consolidate synthetic expert ratings; never a customer survey."""
import csv
import json
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parent
panel = json.loads((ROOT / 'profiles.json').read_text(encoding='utf-8'))
weights = panel['dimension_weights']
assert sum(weights.values()) == 100
people = {p['id']: p for p in panel['profiles']}
assert len(people) == 100
reviews = {}
for name in ['product', 'comprehension', 'workflow']:
    data = json.loads((ROOT / f'{name}-review.json').read_text(encoding='utf-8'))
    rows = data['profiles']
    assert len(rows) == 100, (name, len(rows))
    by_id = {r['id']: r for r in rows}
    assert set(by_id) == set(people)
    for identifier, row in by_id.items():
        scores = row['scores']
        assert set(scores) == set(weights), (name, identifier, set(scores))
        assert all(isinstance(n, (int, float)) and 0 <= n <= 100 for n in scores.values())
        calculated = sum(scores[k] * weights[k] for k in weights) / 100
        assert abs(row['overall'] - calculated) <= .051, (name, identifier, row['overall'], calculated)
        row['overall_exact'] = calculated
    reviews[name] = by_id

rows = []
for identifier, profile in people.items():
    scores = {k: mean(reviews[r][identifier]['scores'][k] for r in reviews) for k in weights}
    score = sum(scores[k] * weights[k] for k in weights) / 100
    rows.append({'id': identifier, 'segment': profile['segment'], 'segment_label': profile['segment_label'],
                 'scores': scores, 'overall': score,
                 'reviewer_overall': {k: v[identifier]['overall_exact'] for k, v in reviews.items()}})

groups = []
for group in dict.fromkeys(p['segment'] for p in people.values()):
    cohort = [r for r in rows if r['segment'] == group]
    groups.append({'segment': group, 'label': cohort[0]['segment_label'], 'count': len(cohort),
                   'overall': mean(r['overall'] for r in cohort)})

result = {'type': 'expert scenario projection; not 100 users or 100 browser sessions',
          'baseline': panel['baseline'], 'profiles': 100, 'reviewers': 3,
          'weights': weights, 'overall': mean(r['overall'] for r in rows),
          'dimension_scores': {k: mean(r['scores'][k] for r in rows) for k in weights},
          'reviewer_overalls': {k: mean(r['overall_exact'] for r in v.values()) for k, v in reviews.items()},
          'groups': groups,
          'sensitivity': {'readable_cv_and_known_vacancy': mean(
              r['overall'] for r in rows
              if people[r['id']]['cv_input'] in ['readable PDF', 'DOCX', 'pasted text']
              and people[r['id']]['job_source'] == 'already has real vacancy')},
          'ratings': rows,
          'limitations': ['Purposive hypothetical mix, not measured audience proportions.',
                         'Three separately assigned contexts using the same underlying model.',
                         'Group bases and profile modifiers are judgments, not measured probabilities.',
                         'Increasing synthetic profile count does not increase statistical confidence.',
                         'No conversion, retention, NPS, hiring outcome, revenue or actual demand estimate.',
                         'No statistical confidence interval; reviewer spread shows judgment disagreement only.']}
(ROOT / 'consolidated.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
with (ROOT / '100-profile-scores.csv').open('w', encoding='utf-8-sig', newline='') as handle:
    writer = csv.DictWriter(handle, fieldnames=['id', 'segment', *weights, 'overall', 'product', 'comprehension', 'workflow'])
    writer.writeheader()
    for r in rows:
        writer.writerow({'id': r['id'], 'segment': r['segment'], **{k: round(v, 2) for k, v in r['scores'].items()},
                         'overall': round(r['overall'], 2), **{k: round(v, 2) for k, v in r['reviewer_overall'].items()}})
print(json.dumps({k: v for k, v in result.items() if k not in ['ratings', 'limitations']}, indent=2))
