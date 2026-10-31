import {describe,it,expect} from 'vitest';
import {analyzeCvEvidence} from '@/lib/cv-evidence';
const cv='Alex Example\nEXPERIENCE\n- Prepared monthly forecasts and reconciled bank statements.\nSKILLS\nExcel, SQL';
const analyze=(job:string)=>analyzeCvEvidence(cv,job,'Analyst');
describe('context cleanup keeps explicit applicant work and manual-review conditions',()=>{
 it.each([
  'Your responsibilities will include preparing monthly forecasts.',
  'The role involves reconciling bank statements.',
  'Your work will include monthly account reconciliation.',
  'Our ideal candidate can communicate clearly.',
  'This position is responsible for writing customer reports.',
 ])('retains an explicit candidate clause: %s',value=>{
  const job='Analyst\nRequirements\nPrepare reports.\n'+value;
  expect(analyze(job).requirements.map(x=>x.vacancyQuote)).toContain(value);
 });
 it.each([
  ['A note on applications','Apply by 31 December 2026.','deadline'],
  ['Pay transparency','Applicants need a valid work permit.','condition'],
  ['A note on eligibility','Candidates need security clearance.','condition'],
 ])('keeps manual review under %s',(heading,value,category)=>{
  const report=analyze('Analyst\n'+heading+'\n'+value);
  const item=report.requirements.find(x=>x.vacancyQuote===value);
  expect(item).toMatchObject({status:'review',category,evidence:[]});
 });
 it('keeps an inline closing date after an employer-context heading',()=>{
  const value='Apply by 31 December 2026.';
  expect(analyze('Analyst\nPay transparency: '+value).requirements).toContainEqual(expect.objectContaining({vacancyQuote:value,status:'review',category:'deadline'}));
 });
 it('examines a whole continued bullet before deciding whether it is context',()=>{
  const value='Applicants need\n  a valid work permit.';
  const job='Analyst\nPay transparency\n- '+value;
  const report=analyze(job);
  expect(report.requirements).toContainEqual(expect.objectContaining({vacancyQuote:value,status:'review',category:'condition'}));
  for(const item of [...report.requirements,...report.omittedSections])expect(job.slice(item.start,item.end)).toBe(item.vacancyQuote);
 });
 it('keeps direct applicant tasks inside employer sections without restoring the adjacent blurb',()=>{
  const value='Your responsibilities will include preparing monthly forecasts.';
  const job='About us\nOur mission is to make reporting simpler. '+value+' Our products support large businesses.';
  const report=analyze(job);
  expect(report.requirements.map(x=>x.vacancyQuote)).toEqual([value]);
  expect(report.omittedSections.map(x=>x.vacancyQuote)).toContain('Our mission is to make reporting simpler.');
 });
 it('retains source offsets and deterministic output through emoji, CRLF and new manual-review clauses',()=>{
  const job='Analyst\r\n🧠 You will...\r\nYour responsibilities will include preparing monthly forecasts.\r\nPay transparency\r\nApplicants need a valid work permit.\r\nThe offered salary depends on location.';
  const report=analyze(job);
  expect(report.requirements).toHaveLength(2);
  expect(report).toEqual(analyze(job));
  for(const item of [...report.requirements,...report.omittedSections])expect(job.slice(item.start,item.end)).toBe(item.vacancyQuote);
 });
});
