from pathlib import Path
from html.parser import HTMLParser
import json
import re

root = Path(__file__).resolve().parents[4]
out = root / 'docs/audits/2026-10-14-20-role-review'

class AuditHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.blocks = []
        self.current = None
        self.ids = []
        self.external_resources = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            self.ids.append(a['id'])
        if tag in ('script', 'iframe', 'img', 'video', 'audio', 'link') and (a.get('src') or a.get('href')):
            self.external_resources.append((tag, a.get('src') or a.get('href')))
        if tag == 'script':
            self.current = {'attrs': a, 'text': ''}
    def handle_data(self, data):
        if self.current is not None:
            self.current['text'] += data
    def handle_endtag(self, tag):
        if tag == 'script' and self.current is not None:
            self.blocks.append(self.current)
            self.current = None

(root / '.tmp/20-role-review').mkdir(parents=True, exist_ok=True)
p = AuditHTML()
p.feed((out / 'REVIEW-DASHBOARD.html').read_text(encoding='utf-8'))
assert not p.external_resources, p.external_resources
assert len(p.ids) == len(set(p.ids)), 'Duplicate DOM IDs'
payload = next(b for b in p.blocks if b['attrs'].get('type') == 'application/json')
data = json.loads(payload['text'])
assert len(data['roles']) == 20 and len(data['findings']) == 88
js = '\n'.join(b['text'] for b in p.blocks if b['attrs'].get('type') != 'application/json')
(root / '.tmp/20-role-review/dashboard-static-check.js').write_text(js, encoding='utf-8')
assert 'fetch(' not in js and 'XMLHttpRequest' not in js and 'sendBeacon' not in js
for anchor in ('CONSOLIDATED-REVIEW.md', 'INDEX.md', 'PRIORITIZED-BACKLOG.csv', 'ALL-FINDINGS.csv', 'COORDINATOR-VERIFICATION.md'):
    assert (out / anchor).is_file(), anchor
for role in data['roles']:
    assert (out / role['markdown_file']).is_file()
    assert (out / role['json_file']).is_file()
print(json.dumps({'static_html_parsed': True, 'embedded_roles': 20, 'embedded_findings': 88, 'external_resource_elements': 0, 'local_deliverable_links_exist': True, 'browser_interaction_tested': False}))
