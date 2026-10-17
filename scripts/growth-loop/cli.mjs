#!/usr/bin/env node
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ReceiptStore } from './receipt-store.mjs';
import { validateCreativeManifest } from './creative-quality.mjs';
import { preparePost, dispatchPost, assess, dispatchPause, status } from './orchestrator.mjs';

// No credentials are accepted. JSON files contain only creative/publication data or
// aggregate evidence. Explicit paths keep private state out of the source checkout.
const [command, ...args] = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i].startsWith('--') || !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(options,args[i].slice(2))) throw new Error('Expected unique --option value pairs');
  options[args[i].slice(2)] = args[i + 1];
}
const allowed = {
  status: ['db'], validate: ['manifest','asset-root'], prepare: ['db','manifest','asset-root','platform'],
  dispatch: ['db','manifest','asset-root','id'], assess: ['db','input','organic'],
  'dispatch-pause': ['db','input','id'], confirm: ['db','id','token','receipt'],
  uncertain: ['db','id','token','reason'], observe: ['db','kind','input'],
};
if (!allowed[command] || Object.keys(options).some(key=>!allowed[command].includes(key))) throw new Error('Commands: status, validate, prepare, dispatch, assess, dispatch-pause, confirm, uncertain, observe');
const required = key => { if (!options[key]) throw new Error(`Missing --${key}`); return options[key]; };
const json = async key => JSON.parse(await readFile(required(key), 'utf8'));
let store;
try {
  if (command !== 'validate') { const file = path.resolve(required('db')); await mkdir(path.dirname(file),{recursive:true}); store = new ReceiptStore(file); }
  let result;
  const now = Date.now();
  if (command === 'status') result = status(store, now);
  if (command === 'validate') result = await validateCreativeManifest(await json('manifest'),{assetRoot:required('asset-root'),now});
  if (command === 'prepare') result = await preparePost(store,await json('manifest'),{assetRoot:required('asset-root'),platform:required('platform'),now});
  if (command === 'dispatch') result = await dispatchPost(store,required('id'),await json('manifest'),{assetRoot:required('asset-root'),now});
  if (command === 'assess' || command === 'dispatch-pause') {
    const input = {...await json('input'),now:new Date(now).toISOString()};
    result = command === 'assess' ? assess(store,input,{organic:options.organic ? {...await json('organic'),now:input.now} : undefined}) : dispatchPause(store,required('id'),input);
  }
  if (command === 'confirm') result = store.confirm(required('id'),required('token'),await json('receipt'),now);
  if (command === 'uncertain') result = store.uncertain(required('id'),required('token'),required('reason'),now);
  if (command === 'observe') result = {id:store.observe(required('kind'),await json('input'),now)};
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if (result.ok === false || result.status === 'blocked') process.exitCode = 2;
} finally { store?.close(); }
