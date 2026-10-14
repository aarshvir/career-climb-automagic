from pathlib import Path
import csv
import html
import json
import re
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / 'docs/audits/2026-10-14-20-role-review'
reports = []
all_ids = set()
for i in range(1, 21):
    paths = list(OUT.glob(f'{i:02d}-*.json'))
    assert len(paths) == 1, f'Expected exactly one report for role {i}: {paths}'
    path = paths[0]
    d = json.loads(path.read_text(encoding='utf-8-sig'))
    assert path.with_suffix('.md').is_file(), path
    assert len(d['criteria']) == 5, path
    assert all(c['weight'] == 20 and 0 <= c['score'] <= 20 for c in d['criteria']), path
    assert sum(c['score'] for c in d['criteria']) == d['role_score'], path
    assert d['snapshot']['runtime_commit'] == '57713fb1cb15b29be8d6dc745e3c87bcb718c4af', path
    assert d['snapshot']['source_head'] == 'e661c6493c30c88f2487800ff38aa10c46c9aae6', path
    d['number'] = i
    d['markdown_file'] = path.with_suffix('.md').name
    d['json_file'] = path.name
    for f in d['findings']:
        assert f['id'] not in all_ids, f['id']
        all_ids.add(f['id'])
        assert f['priority'] in ('P0', 'P1', 'P2', 'P3'), f['id']
        assert f['acceptance_criteria'] and f['evidence'], f['id']
    reports.append(d)

plan = json.loads((OUT / 'COORDINATOR-BACKLOG.json').read_text(encoding='utf-8-sig'))
mapped = set()
for p in plan['packages']:
    assert set(p['finding_ids']) <= all_ids, p['id']
    mapped.update(p['finding_ids'])
assert mapped == all_ids, f'Unmapped findings: {sorted(all_ids - mapped)}'
assert all(sum(fid in p['finding_ids'] for p in plan['packages']) == 1 for fid in all_ids), 'Each finding must have exactly one primary package'

findings = [{**f, 'role_id': d['role_id'], 'role_title': d['role_title'], 'phase': d['phase']} for d in reports for f in d['findings']]
data = {'review_date': '2026-10-14', 'generated_utc': datetime.now(timezone.utc).isoformat(), 'roles': reports, 'findings': findings, 'plan': plan}
(OUT / 'ALL-REVIEWS.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

with (OUT / 'ALL-FINDINGS.csv').open('w', encoding='utf-8-sig', newline='') as stream:
    fields = ['id', 'role_title', 'phase', 'priority', 'category', 'problem', 'recommendation', 'personas', 'evidence', 'acceptance_criteria', 'dependencies', 'effort_low_days', 'effort_high_days', 'cost_effect', 'confidence', 'pilot_required']
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    for f in findings:
        row = {k: f.get(k, '') for k in fields}
        row.update(personas='; '.join(f['impacted_personas']), evidence=json.dumps(f['evidence'], ensure_ascii=False), acceptance_criteria=' | '.join(f['acceptance_criteria']), dependencies=' | '.join(f['dependencies']), effort_low_days=f['effort_engineer_days']['low'], effort_high_days=f['effort_engineer_days']['high'])
        writer.writerow(row)

with (OUT / 'PRIORITIZED-BACKLOG.csv').open('w', encoding='utf-8-sig', newline='') as stream:
    fields = ['id', 'wave', 'title', 'owner', 'priority', 'decision', 'effort_low_days', 'effort_high_days', 'dependencies', 'acceptance_criteria', 'finding_ids']
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    for p in plan['packages']:
        row = {k: p.get(k, '') for k in fields}
        row.update(dependencies=' | '.join(p['dependencies']), acceptance_criteria=' | '.join(p['acceptance_criteria']), finding_ids='; '.join(p['finding_ids']))
        writer.writerow(row)

lines = ['# Twenty independent role reviews', '', '14 October 2026. Local private analysis; no runtime deployment or outreach in this round.', '', 'Each area score is the sum of five role-specific criteria, each out of 20. Scores are expert judgments with stated evidence limits; they are not whole-product grades, measured customer outcomes or promises of future scores.', '', '| # | Role | Area readiness /100 | Confidence | Live checked | Report |', '|---|---|---:|---|---|---|']
for d in reports:
    lines.append(f"| {d['number']} | {d['role_title']} | {d['role_score']} | {d['score_confidence']} | {'Yes, see scope' if d['snapshot']['live_checked'] else 'No; see methods'} | [{d['markdown_file']}](<{d['markdown_file']}>) |")
lines += ['', f"All {len(findings)} original findings appear in [ALL-FINDINGS.csv](ALL-FINDINGS.csv); every finding maps to a coordinator work package in [COORDINATOR-BACKLOG.json](COORDINATOR-BACKLOG.json).", '', 'Read [CONSOLIDATED-REVIEW.md](CONSOLIDATED-REVIEW.md) for decisions and the [interactive local report](REVIEW-DASHBOARD.html) for filters. [Coordinator verification](COORDINATOR-VERIFICATION.md) distinguishes reproduced issues from suspicions and unavailable evidence.', '']
(OUT / 'INDEX.md').write_text('\n'.join(lines), encoding='utf-8')

payload = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
template = r'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Jobvance · Twenty-role review</title><style>
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#173a31;background:#f3f2e9;font-size:16px;line-height:1.55}*{box-sizing:border-box}body{margin:0}header{background:#123d32;color:#fff;padding:38px max(22px,calc((100vw - 1180px)/2)) 32px}h1{font-size:clamp(2rem,5vw,3.3rem);line-height:1.12;letter-spacing:-.04em;margin:.45em 0}h2{font-size:1.35rem;line-height:1.25;margin:.3em 0 .7em}h3{font-size:1.05rem;margin:.25em 0 .6em}p{margin:.5em 0 1em}.eyebrow{font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:#bae9d1}.lead{max-width:820px;color:#daebe3}.wrap{max-width:1224px;margin:auto;padding:22px}.notice{background:#e5ecdf;padding:16px 20px;border-left:4px solid #51765c;border-radius:5px}.controls{position:sticky;top:0;z-index:2;background:#f3f2e9f5;backdrop-filter:blur(8px);padding:14px 0;display:flex;gap:10px;flex-wrap:wrap;align-items:end}.controls label{display:grid;font-size:.8rem;gap:4px;font-weight:600}.controls input,.controls select{font:inherit;color:#173a31;min-height:44px;border:1px solid #a5b6a8;border-radius:7px;padding:8px 11px;background:#fff}.controls input{min-width:240px}.tabs{display:flex;gap:8px;margin:20px 0 14px;flex-wrap:wrap}button{font:inherit;border:1px solid #688c76;padding:10px 16px;min-height:44px;border-radius:7px;color:#173a31;background:transparent;cursor:pointer}button[aria-pressed=true]{background:#173f33;color:white}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #b67226;outline-offset:3px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:16px}.card{background:#fffef8;border:1px solid #d2dccc;border-radius:12px;padding:22px;box-shadow:0 3px 12px #143f3206}.score{font-size:2.4rem;letter-spacing:-.06em;font-weight:650;line-height:1.1}.meta,.muted{color:#57695d;font-size:.85rem}.tag{display:inline-block;background:#e8eedf;border-radius:5px;padding:2px 7px;margin:0 5px 5px 0;font-size:.76rem;color:#33543e}.p1{background:#f7e6c3;color:#75431f}.p0{background:#f5d3c9;color:#722716}ul,ol{padding-left:1.35em;margin:.4em 0 1em}li{margin:.45em 0}.criteria{display:grid;gap:7px;margin:15px 0}.criterion{display:grid;grid-template-columns:1fr auto;gap:10px;font-size:.86rem}.bar{height:5px;background:#e3e9dd;border-radius:3px;grid-column:1/-1;overflow:hidden}.fill{height:100%;background:#4d8866}.findings{display:grid;gap:15px}.findings .card{padding:23px}summary{cursor:pointer;font-weight:600;margin-top:12px;min-height:30px}details>div{padding-top:10px}a{color:#226548;text-underline-offset:3px}header a{color:#d0eddb}footer{font-size:.85rem;padding:25px 0;color:#52665a}.empty{padding:30px;border:1px dashed #879d89;border-radius:8px}#status{font-size:.85rem;color:#52665a;margin:10px 0}.metrics{display:flex;gap:30px;flex-wrap:wrap;margin-top:23px}.metrics strong{display:block;font-size:1.8rem;line-height:1.1;color:#dbefd6}.metrics span{font-size:.8rem;color:#c5d8cb}.package{border-left:5px solid #6e8f6c}.package[data-wave="1"]{border-left-color:#b77d38}.package .row{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap}.hidden{display:none!important}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:.85rem} @media(max-width:600px){header{padding:26px 20px}.wrap{padding:17px}.controls label{flex:1;min-width:115px}.controls input{min-width:100%;width:100%}.controls label:first-child{flex-basis:100%}.card{padding:18px}.metrics{gap:20px}.grid{grid-template-columns:1fr}}
</style></head><body><header><div class="eyebrow">Jobvance · Private local review · 14 October 2026</div><h1>Twenty roles.<br>One product plan.</h1><p class="lead">Separate reviews of the same product, consolidated into shared fixes for students, MBAs and busy professionals. Filter findings, examine evidence and see the acceptance checks for the next release.</p><div class="metrics"><div><strong id="rolesN">20</strong><span>independent role contexts</span></div><div><strong id="findingsN"></strong><span>original findings retained</span></div><div><strong id="packagesN"></strong><span>consolidated work packages</span></div></div></header><main class="wrap"><div class="notice">These are role-specific readiness judgments, not a whole-product certification or a promise of 95+. Source review, synthetic reproductions, live public checks and untested boundaries are labelled. No ads, messages, purchases or runtime changes were made in this round.</div><nav class="tabs" aria-label="Report views"><button data-view="plan" aria-pressed="true">Prioritized plan</button><button data-view="roles" aria-pressed="false">20 role reviews</button><button data-view="findings" aria-pressed="false">All findings</button></nav><div class="controls"><label>Search<input id="q" type="search" placeholder="Drafts, support, SEO…"></label><label>Department<select id="phase"><option value="">All departments</option><option value="build">Build</option><option value="growth">Launch & growth</option><option value="operations">Live operations</option></select></label><label>Priority<select id="priority"><option value="">All priorities</option><option>P0</option><option>P1</option><option>P2</option><option>P3</option></select></label><label>Audience<select id="persona"><option value="">All audiences</option><option value="student">Students</option><option value="mba">MBAs</option><option value="professional">Busy professionals</option></select></label></div><p id="status" role="status" aria-live="polite"></p><section id="content" aria-label="Review results"></section><footer>Frozen runtime: <code>57713fb</code> · Public version19 · Documentation HEAD: <code>e661c64</code><br><a href="CONSOLIDATED-REVIEW.md">Full consolidated report</a> · <a href="INDEX.md">All original reports</a> · <a href="PRIORITIZED-BACKLOG.csv">Prioritized CSV</a> · <a href="ALL-FINDINGS.csv">Every original finding</a> · <a href="COORDINATOR-VERIFICATION.md">Coordinator verification</a></footer></main><script id="data" type="application/json">PAYLOAD</script><script>
const data=JSON.parse(document.getElementById('data').textContent);let view='plan';const $=id=>document.getElementById(id);const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const list=xs=>'<ul>'+xs.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';const tag=(s,c='')=>'<span class="tag '+c+'">'+esc(s)+'</span>';const textHas=(x,q)=>!q||JSON.stringify(x).toLowerCase().includes(q);const roleFindings=d=>d.findings.filter(matches);function matches(f){return(!$('phase').value||f.phase===$('phase').value||data.roles.find(r=>r.role_id===f.role_id)?.phase===$('phase').value)&&(!$('priority').value||f.priority===$('priority').value)&&(!$('persona').value||f.impacted_personas.includes($('persona').value))&&textHas(f,$('q').value.trim().toLowerCase())}const evidence=f=>f.evidence.map(e=>'<p class="meta">'+esc(e.type)+': '+esc(e.path?(e.path+(e.line?':'+e.line:'')):'')+(e.url?' · <a target="_blank" rel="noreferrer" href="'+esc(String(e.url).startsWith('https://')?e.url:'#')+'">Primary source</a>':'')+'<br>'+esc(e.detail)+'</p>').join('');
function render(){const q=$('q').value.trim().toLowerCase();let result=[];if(view==='roles'){result=data.roles.filter(d=>(!$('phase').value||d.phase===$('phase').value)&&textHas(d,q)&&(!$('priority').value||d.findings.some(f=>f.priority===$('priority').value))&&(!$('persona').value||d.findings.some(f=>f.impacted_personas.includes($('persona').value))));$('content').className='grid';$('content').innerHTML=result.map(d=>'<article class="card">'+tag(d.phase)+'<h2>'+esc(d.role_title)+'</h2><div class="score">'+d.role_score+'<span class="meta"> /100</span></div><p class="meta">'+esc(d.score_confidence)+' confidence · '+(d.snapshot.live_checked?'Live checks: see scope':'Source/local scope: see methods')+'</p><div class="criteria">'+d.criteria.map(c=>'<div class="criterion"><span>'+esc(c.name)+'</span><strong>'+c.score+'/20</strong><div class="bar"><div class="fill" style="width:'+(c.score*5)+'%"></div></div></div>').join('')+'</div><details><summary>Strengths & scope</summary><div>'+list(d.strengths)+'<h3>Methods</h3>'+list(d.methods)+'<h3>Not tested</h3>'+list(d.not_tested)+'</div></details><p><a href="'+esc(d.markdown_file)+'">Read the full independent review</a></p></article>').join('')}
else if(view==='findings'){result=data.findings.filter(matches);$('content').className='findings';$('content').innerHTML=result.map(f=>'<article class="card">'+tag(f.priority,f.priority.toLowerCase())+tag(f.role_title)+'<h2>'+esc(f.problem)+'</h2><p>'+esc(f.recommendation)+'</p><p class="meta">'+esc(f.id)+' · '+esc(f.confidence)+' confidence · '+f.effort_engineer_days.low+'–'+f.effort_engineer_days.high+' engineering days (estimate)</p><details><summary>Evidence, acceptance & dependencies</summary><div>'+evidence(f)+'<h3>Acceptance checks</h3>'+list(f.acceptance_criteria)+'<h3>Dependencies</h3>'+list(f.dependencies)+'<p>'+esc(f.cost_effect)+'</p></div></details></article>').join('')}
else{result=data.plan.packages.filter(p=>{const fs=data.findings.filter(f=>p.finding_ids.includes(f.id));return textHas(p,q)&&(!$('phase').value||fs.some(f=>f.phase===$('phase').value))&&(!$('priority').value||p.priority===$('priority').value)&&(!$('persona').value||fs.some(f=>f.impacted_personas.includes($('persona').value)))});$('content').className='findings';$('content').innerHTML=result.map(p=>'<article class="card package" data-wave="'+p.wave+'"><div class="row"><div>'+tag('Wave '+p.wave)+tag(p.priority,p.priority.toLowerCase())+'</div><span class="meta">'+esc(p.id)+' · '+p.effort_low_days+'–'+p.effort_high_days+' engineering days</span></div><h2>'+esc(p.title)+'</h2><p>'+esc(p.decision)+'</p><p class="meta">Owner: '+esc(p.owner)+'</p><details><summary>Acceptance, dependencies & linked findings</summary><div><h3>Acceptance checks</h3>'+list(p.acceptance_criteria)+'<h3>Dependencies</h3>'+list(p.dependencies)+'<p class="meta">'+esc(p.finding_ids.join(' · '))+'</p></div></details></article>').join('')}
if(!result.length)$('content').innerHTML='<p class="empty">No results match these filters.</p>';$('status').textContent=result.length+' '+(view==='roles'?'roles':view==='plan'?'work packages':'findings')+' shown. Estimates are planning assumptions, not quotes.'}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));render()}));['q','phase','priority','persona'].forEach(id=>$(id).addEventListener(id==='q'?'input':'change',render));$('findingsN').textContent=data.findings.length;$('packagesN').textContent=data.plan.packages.length;render();
</script></body></html>'''
dashboard = template.replace('PAYLOAD', payload)
(OUT / 'REVIEW-DASHBOARD.html').write_text(dashboard, encoding='utf-8')

validation = {'roles': len(reports), 'criterion_scores': sum(len(r['criteria']) for r in reports), 'original_findings': len(findings), 'packages': len(plan['packages']), 'all_finding_ids_mapped': mapped == all_ids, 'each_finding_has_one_primary_package': True, 'score_totals_valid': True, 'snapshot_consistent': True, 'generated_utc': data['generated_utc'], 'runtime_changed': False, 'new_paid_calls': 0, 'dashboard_browser_validation': 'Not performed: file URL was blocked by browser security policy; no workaround attempted. Markdown/CSV and static validation are the authoritative deliverables.'}
(OUT / 'REPORT-VALIDATION.json').write_text(json.dumps(validation, indent=2) + '\n', encoding='utf-8')
print(json.dumps(validation))
