// Read-only reproduction of audit findings. Entire input is fictional.
import { analyzeCvEvidence } from '../../../src/lib/cv-evidence.ts';
import { writeFile } from 'node:fs/promises';

const prefix = [
  'Fictional Student', 'EDUCATION',
  'BSc Computer Science, expected graduation June 2027.',
  'PROJECTS', 'University team project',
  '- Developed Python reports for a university team project.',
  '- Supported data cleaning. I did not lead the team.', 'SKILLS',
].join('\n') + '\n';
const vacancy = [
  'Requirements', 'Develop Python reports.',
  "Bachelor's degree in computer science completed by August 2027.",
  'Visa sponsorship is not available.',
  'Applications close 30 November 2026.',
].join('\n');
const withSkills = prefix + 'Python, SQL coursework, Excel, English';
const withoutSkills = prefix + 'SQL coursework, Excel, English';
const original = analyzeCvEvidence(withSkills, vacancy);
const counterfactual = analyzeCvEvidence(withoutSkills, vacancy);
const finding = report => report.requirements.find(row => row.vacancyQuote === 'Develop Python reports.');
const a = finding(original), b = finding(counterfactual);
const changed = a?.status === 'review' && b?.status === 'direct';
const evidence = {
  date: '2026-10-11', sourceCommit: '2d1ad90356a7c952740dde2c9bf02ab5880a1414',
  scope: 'Pure function reproduction, not a live browser/cloud test. All inputs fictional. No product files changed.',
  onlyDifference: 'Python, removed from the separate skills line; project and vacancy unchanged.',
  cvOriginal: withSkills, cvCounterfactual: withoutSkills, vacancy,
  classificationChanged: changed,
  original: original.requirements, counterfactual: counterfactual.requirements,
};
await writeFile(new URL('./root-evidence-reproduction.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({classificationChanged: changed, originalStatus:a?.status, counterfactualStatus:b?.status,
  otherFindings: original.requirements.filter(r => r !== a).map(r => ({vacancy:r.vacancyQuote,status:r.status,quotes:r.evidence.map(e=>e.cvQuote), explanation:r.explanation,question:r.question}))},null,2));
if (!changed) process.exitCode = 1;
