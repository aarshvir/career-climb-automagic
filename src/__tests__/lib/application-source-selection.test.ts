import { describe, expect, it } from 'vitest';
import { isApplicationSourcePath, readApplicationSource } from '@/lib/application-source-selection';
import { accountDestination, rememberLoopReturn, takeLoopReturn, workspaceReturnPath } from '@/lib/account-return';
const id='ab123456-1234-4234-8234-123456789abc';
describe('exact private application source destinations',()=>{
 it('preserves all exact source selectors and consumes auth continuation once',()=>{
  for(const path of [`/check?savedCheck=${id}`,`/dashboard?pack=${id}`,`/dashboard?tracked=${id}`,`/loop?opportunity=${id}&generation=3`]){
   expect(isApplicationSourcePath(path)).toBe(true);expect(accountDestination(path)).toBe(path);
   rememberLoopReturn(path,100);expect(takeLoopReturn(101)).toBe(path);expect(takeLoopReturn(102)).toBeNull();
  }
  expect(accountDestination('/applications')).toBe('/applications');
  for(const key of [`check:${id}`,`pack:${id}`,`tracker:${id}`,`loop:3:${id}`]) {
    for(const value of [key,encodeURIComponent(key)]) expect(accountDestination(`/applications?item=${value}`)).toBe(`/applications?item=${value}`);
  }
  expect(isApplicationSourcePath(`/applications?item=loop:9007199254740992:${id}`)).toBe(false);
  expect(isApplicationSourcePath(`/applications?item=check:${id}&item=pack:${id}`)).toBe(false);
  expect(workspaceReturnPath(`?pack=${id}`)).toBe(`/dashboard?pack=${id}`);
 });
 it('normalizes UUID casing and retains exact generation',()=>{
  expect(readApplicationSource(`?opportunity=${id.toUpperCase()}&generation=0`,'opportunity')).toEqual({id,generation:0});
 });
 it.each([`/check?savedCheck=${id}&savedCheck=${id}`,`/check?savedCheck=${id}&next=/admin`,`/check?savedCheck=${id}#token`,`/check?savedCheck=${id.replace('a','%61')}`,`/dashboard?pack=${id}&tab=tailor`,`/dashboard?tracked=${id}&pack=${id}`,`/loop?opportunity=${id}`,`/loop?opportunity=${id}&generation=-1`,`/loop?opportunity=${id}&generation=01`,`/loop?opportunity=${id}&generation=9007199254740992`,`//evil/check?savedCheck=${id}`])('rejects ambiguous or unsafe selector %s',path=>expect(isApplicationSourcePath(path)).toBe(false));
});
