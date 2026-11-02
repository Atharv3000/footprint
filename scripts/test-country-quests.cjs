const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const catalog = JSON.parse(fs.readFileSync('assets/data/countryBorders.json','utf8'));
const memory = new Map(), privateStore = new Map(), calls = [];
const storage = {getItem:async k=>memory.get(k)||null,setItem:async(k,v)=>{memory.set(k,v);}};
let writes = 0; const exportsObject = {};
const start = '2026-10-30T12:00:00Z', now = Date.parse('2026-10-30T13:00:00Z');
const walk = {id:'walk_real',userId:'host',date:'2026-10-30T12:30:00Z',activityType:'walk',durationSeconds:600,steps:1000};
const fixture = {code:'ABCDEF123456',countryId:'JPN',title:'Team Japan',goalSteps:1000000,totalSteps:0,status:'active',you:'host',isOwner:true,joinedAt:start,left:false,members:[]};
const compile = source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
vm.runInNewContext(compile(fs.readFileSync('constants/countryQuests.ts','utf8')),{
 exports:exportsObject,require:name=>{
  if(name.includes('async-storage'))return {__esModule:true,default:storage};
  if(name==='expo-secure-store')return {getItemAsync:async k=>privateStore.get(k)||null,setItemAsync:async(k,v)=>{privateStore.set(k,v);}};
  if(name==='expo-crypto')return {randomUUID:crypto.randomUUID};
  if(name==='react-native')return {DeviceEventEmitter:{emit:()=>{}}};
  if(name==='./repTrackerProtocol')return {repServerUrl:()=> 'https://fixture/rep-api'};
  if(name==='./walkStorage')return {loadRecordedWalks:async()=>[walk]};
  if(name.includes('countryBorders.json'))return {__esModule:true,default:catalog};
  throw Error(name);
 },process:{env:{EXPO_PUBLIC_REP_TOKEN:'test'}},setTimeout,clearTimeout,AbortController,
 fetch:async(url,options)=>{const data=JSON.parse(options.body);calls.push(data);return {ok:true,json:async()=>({...fixture,totalSteps:data.steps||0})};}
});
const api=exportsObject;
test('only new real walks/runs count, excluding demo/cycling/duplicate/other-account records',()=>{
 const records=[walk,{...walk},{...walk,id:'run_real',activityType:'run',steps:2000},
 {...walk,id:'walk_demo_1',steps:9000},{...walk,id:'cycle',activityType:'cycle'},
 {...walk,id:'old',date:'2026-10-29T12:00:00Z'},{...walk,id:'future',date:'2027-01-01T00:00:00Z'},
 {...walk,id:'other',userId:'other'},{...walk,id:'bad',steps:NaN}];
 assert.equal(api.eligibleWalkingSteps(records,'host',start,now),3000);
 assert.equal(api.eligibleWalkingSteps(records,'host','invalid',now),0);
});
test('map progress uses distance weights and keeps islands disconnected',()=>{
 const route={id:'TST',name:'Test',totalKm:20,rings:[{points:[[0,0],[100,0],[100,10]],lengths:[1,9]},{points:[[500,0],[600,0]],lengths:[10]}]};
 assert.deepEqual(Array.from(api.borderProgress(route,1310).marker),[100,0]);
 const result=api.borderProgress(route,15*1310);
 assert.equal(result.paths.length,2);assert.ok(result.paths[1].startsWith('M 500 0'));
 assert.deepEqual(Array.from(result.marker),[550,0]);
 assert.deepEqual(Array.from(api.borderProgress(route,0).marker),[0,0]);
 assert.deepEqual(Array.from(api.borderProgress(route,1000000).marker),[600,0]);
});
test('all bundled outlines have finite projected closed rings and consistent distances',()=>{
 assert.equal(catalog.countries.length,176);
 assert.ok(catalog.countries.some(c=>c.id==='USA'));assert.ok(catalog.countries.some(c=>c.id==='JPN'));
 for(const country of catalog.countries){let sum=0;assert.ok(country.totalKm>0);
  for(const ring of country.rings){assert.equal(ring.lengths.length,ring.points.length-1);assert.deepEqual(ring.points[0],ring.points.at(-1));
   for(const [x,y] of ring.points){assert.ok(Number.isFinite(x)&&x>=0&&x<=1000);assert.ok(Number.isFinite(y)&&y>=0&&y<=700);}
   sum+=ring.lengths.reduce((a,b)=>a+b,0);
  }assert.ok(Math.abs(country.totalKm-sum)<.001);
 }
});
test('create and sync queue preserves membership and keeps access key out of cache',async()=>{
 await Promise.all([api.createCountryQuest('host','Host','JPN','Team Japan'),api.syncCountryQuests('host')]);
 const records=await api.cachedCountryQuests('host');assert.equal(records.length,1);assert.equal(records[0].totalSteps,1000);
 const request=calls.find(c=>c.action==='sync');assert.equal(request.steps,1000);assert.ok(request.walkerKey.length>=64);
 assert.ok(!JSON.stringify(records).includes(request.walkerKey));assert.equal((await api.cachedCountryQuests('other')).length,0);
});
test('raw walk loader does not seed history and save/delete emit scoped change events',async()=>{
 const exports={};const data=new Map();const events=[];
 vm.runInNewContext(compile(fs.readFileSync('constants/walkStorage.ts','utf8')),{exports,console,
 require:name=>name==='react-native'?{DeviceEventEmitter:{emit:(...args)=>events.push(args)}}:{__esModule:true,default:{getItem:async k=>data.get(k)||null,setItem:async(k,v)=>{writes++;data.set(k,v);}}}});
 assert.equal((await exports.loadRecordedWalks('host')).length,0);assert.equal(writes,0);
 const saved=await exports.saveWalk('host',{durationSeconds:600,steps:1000,distanceMeters:763,calories:40,avgPace:'10:00',routeCoordinates:[],activityType:'walk'});
 assert.equal(events[0][0],exports.WALKS_CHANGED);assert.equal(events[0][1].userId,'host');
 await exports.deleteWalk('host',saved.id);assert.equal(events.length,2);assert.equal((await exports.loadRecordedWalks('host')).length,0);
});
