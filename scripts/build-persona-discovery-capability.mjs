// Run with Node 24: node --experimental-transform-types scripts/build-persona-discovery-capability.mjs
// This is a capability/evidence inventory, not a scored visitor simulation.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { inspectDiscoveryTarget } from '../src/lib/employer-discovery.ts';

const personaPath = 'docs/audits/2026-10-17-pmf-simulation/personas.json';
const rulesPath = 'docs/audits/2026-10-17-pmf-simulation/AGENT_BRIEF.md';
const receiptPath = 'docs/audits/2026-10-17-discovery/live-source-readback.json';
const bytes = readFileSync(personaPath); const rules = readFileSync(rulesPath);
const personas = JSON.parse(bytes); const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
if (personas.length !== 100 || new Set(personas.map(p => p.id)).size !== 100) throw new Error('The fixed 100-persona input must be retained.');

// Explicitly authored role probes for the field labels, not new persona answers.
const fieldProbes = {
  'healthcare admin': ['Healthcare Administrator', 'Medical Administrator', 'Healthcare Operations Manager'],
  'data analytics': ['Data Analyst', 'Analytics Engineer', 'Business Intelligence Analyst'],
  'software engineering': ['Software Engineer', 'Software Developer'],
  consulting: ['Consultant', 'Strategy Consultant'],
  'product management': ['Product Manager'],
  marketing: ['Marketing Manager', 'Marketing Specialist', 'Marketing Coordinator'],
  HR: ['Human Resources Manager', 'Human Resources Specialist', 'Recruiter'],
  'construction/real estate': ['Construction Manager', 'Civil Engineer', 'Real Estate Analyst'],
  finance: ['Finance Manager', 'Financial Analyst', 'Accountant'],
  logistics: ['Logistics Manager', 'Logistics Coordinator', 'Supply Chain Analyst'],
  education: ['Teacher', 'Education Coordinator', 'Academic Administrator'],
  sales: ['Account Executive', 'Sales Representative', 'Sales Manager'],
  'customer service': ['Customer Service Representative', 'Customer Support Specialist'],
  operations: ['Operations Manager', 'Operations Analyst', 'Operations Coordinator'],
  hospitality: ['Hotel Manager', 'Guest Services', 'Hospitality Manager'],
};
const samples = receipt.reports.flatMap(report => (report.sample ?? []).map(sample => ({ ...sample, company: report.company, board: report.board, provider: report.provider, description: '' })));
const rows = personas.map(persona => {
  const probes = fieldProbes[persona.field]; if (!probes) throw new Error(`Unmapped original field ${persona.field}`);
  const profile = {targetTitles:probes,locations:[persona.country],experienceYears:persona.years_experience,excludedTerms:[],compensation:{currency:'',period:'annual',minimum:null}};
  const witnesses = samples.filter(sample => {
    const observed = inspectDiscoveryTarget(profile, sample);
    return observed.role === 'matched' && observed.location === 'matched';
  }).map(({title,location,url,board}) => ({title,location,url,board}));
  const remaining = ['No fourteen-day delivery observation', 'No personal work-authorisation or language eligibility established', 'No persona-specific job description or prepared CV observed'];
  if (persona.device === 'mobile') remaining.push('Actual mobile completion must include quiz, source review, fact confirmation and schedule activation');
  if (persona.cv_state === 'no proper CV yet') remaining.push('Guided CV creation must reach confirmed facts and a selected recurring CV, not stop at saved text');
  if (persona.segment === 'career_coach_or_university') remaining.push('Individual account flow does not establish multi-client administration, invoicing or institutional access');
  if (persona.privacy_sensitivity === 'high') remaining.push('Verify understandable source/provider consent and recoverable progress before scoring trust');
  return {
    persona_id:persona.id, segment:persona.segment, original_country:persona.country, original_field:persona.field, original_device:persona.device, original_cv_state:persona.cv_state,
    authored_role_probes:probes,
    location_assumption:'The original country is used only as a labelled search probe. Residence does not establish desired work location or work authorisation.',
    evidence_status:witnesses.length ? 'partial_title_location_witness_only' : 'not_established_in_saved_sample',
    public_listing_witnesses:witnesses,
    caveat:'The saved readback retains two examples per board. No witness is not proof of zero jobs. A title/location witness is not proof this persona qualifies or would pay.',
    remaining_acceptance:remaining,
    scored_nps:null, trial_to_paid:null, simulated_days_observed:0,
  };
});
const count = field => personas.reduce((out,p) => (out[p[field]]=(out[p[field]]??0)+1,out),{});
const result = {
  generatedAt:new Date().toISOString(), kind:'fixed_persona_discovery_capability_inventory',
  inputs:{personas:{path:personaPath,sha256:sha256(bytes)},realismRules:{path:rulesPath,sha256:sha256(rules)},sourceReadback:{path:receiptPath,checkedAt:receipt.checkedAt}},
  method:'No network requests. The unchanged 100 original personas are inventoried against only the saved public listing examples. Authored role probes are disclosed. No NPS, willingness-to-pay, retention or conversion is predicted.',
  counts:{personas:rows.length,countries:count('country'),fields:count('field'),devices:count('device'),cvStates:count('cv_state'),partialTitleLocationWitness:rows.filter(row=>row.public_listing_witnesses.length).length,notEstablishedInSavedSample:rows.filter(row=>!row.public_listing_witnesses.length).length},
  missingGroundTruth:['New account-to-quiz-to-confirmed-facts-to-recurring-schedule browser observation','New deployed public-page snapshot','Actual repeated delivery observation; calendar compression is not fourteen-day product use','Actual recurring billing journey before any trial-to-paid claim'],
  nps:null,trialToPaid:null,rows,
};
if (sha256(readFileSync(personaPath))!==sha256(bytes) || sha256(readFileSync(rulesPath))!==sha256(rules)) throw new Error('Fixed inputs changed during assessment.');
writeFileSync('docs/audits/2026-10-17-discovery/persona-capability-matrix.json', JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({rows:rows.length,partialTitleLocationWitness:result.counts.partialTitleLocationWitness,notEstablishedInSavedSample:result.counts.notEstablishedInSavedSample,nps:null,trialToPaid:null}));
