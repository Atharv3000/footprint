const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('constants/calorieChallenges.ts', 'utf8');
const memory = new Map(); const secrets = new Map(); const calls = [];
const store = map => ({ getItem: async k => map.get(k) || null, setItem: async (k,v) => { map.set(k,v); } });
const cache = store(memory), secure = store(secrets);
const fixture = {code:'ABCDEF123456',mode:'cut',target:2000,days:7,timezone:'UTC',start:'2026-10-30',end:'2026-11-05',today:'2026-10-30',status:'active',you:0,winner:null,players:[{name:'You',score:0,calories:0,complete:false},{name:'Friend',score:0,calories:0,complete:false}]};
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {
 exports:exportsObject, require:name => {
  if(name.includes('async-storage')) return {__esModule:true,default:cache};
  if(name==='expo-secure-store') return {getItemAsync:secure.getItem,setItemAsync:secure.setItem};
  if(name==='react-native') return {DeviceEventEmitter:{emit:()=>{}}};
  if(name==='./repTrackerProtocol') return {repServerUrl:()=> 'https://fixture/rep-api'};
  if(name==='./nutritionStorage') return {loadMealLogs:async()=>[{id:'meal1',dateKey:'2026-10-30',calories:2000}]};
  throw Error(name);
 },process:{env:{EXPO_PUBLIC_REP_TOKEN:'fixture-token'}},setTimeout,clearTimeout,AbortController,Intl,
 fetch:async(url,options)=>{ const data=JSON.parse(options.body);calls.push({url,options,data});
  return {ok:true,json:async()=>data.action==='create'?{key:'private-member-key',challenge:fixture}:fixture};
 }
});
const api=exportsObject;
test('totals exclude duplicates, future days, out-of-range and invalid calories',()=>{
 const result=api.challengeTotals([
 {id:'a',dateKey:'2026-10-30',calories:200},{id:'a',dateKey:'2026-10-30',calories:200},
 {id:'b',dateKey:'2026-10-30',calories:500},{id:'c',dateKey:'2026-10-31',calories:100},
 {id:'d',dateKey:'2026-10-29',calories:100},{id:'e',dateKey:'2026-10-30',calories:-100},
 {id:'f',dateKey:'2026-10-30',calories:NaN}],fixture);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{'2026-10-30':700});
});
test('waiting invites do not receive historical meals',()=>assert.equal(Object.keys(api.challengeTotals([{id:'a',dateKey:'2026-10-30',calories:2000}],{...fixture,start:null})).length,0));
test('account-scoped secure capabilities and queued sync preserve newly created membership',async()=>{
 const create=api.createCalorieChallenge('host-account','Host','cut',2000,7);
 const sync=api.syncCalorieChallenges('host-account');
 await create;const result=await sync;
 assert.equal(result.length,1);
 assert.equal(result[0].code,fixture.code);
 const update=calls.find(c=>c.data.action==='update');
 assert.equal(update.data.key,'private-member-key');
 assert.equal(update.data.totals['2026-10-30'],2000);
 assert.equal(update.options.headers.Authorization,'Bearer fixture-token');
 assert.ok(!memory.get('@footprint_calorie_challenges_host-account').includes('private-member-key'));
 assert.equal((await api.cachedChallenges('other-account')).length,0);
 await assert.rejects(api.joinCalorieChallenge('host-account','Host',fixture.code),/already joined/);
});

