const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {createRequire}=require('module'),req=createRequire('C:/Users/shihc/footprint-1/package.json'),ts=req('typescript');
const exp={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(__dirname+'/../constants/workoutSessionLogging.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exp});
const {completedWorkoutEntries:entries,confirmedCameraWeight:weight}=exp;
const row=(completed,extra={})=>({completed,reps:10,weight:25,multiplier:1,...extra});
const exercise=sets=>[{exerciseId:'curls',name:'Curls',sets}];
test('only checked sets are saved; checked multipliers count as sets',()=>{
 const result=entries(exercise([row(false),row(true,{multiplier:3}),row(true,{weight:0})]),'kg','Arms');
 assert.equal(result.length,4);assert.equal(result[0].weight,25);assert.equal(result[0].weightUnit,'kg');assert.equal(result[3].weight,0);
 assert.equal(entries(exercise([row(false)]),'lb','Arms').length,0);
});
test('invalid checked input aborts before any write; unchecked draft input is ignored',()=>{
 for(const extra of [{reps:0},{reps:1.5},{weight:NaN},{weight:-1},{multiplier:5}]){
  assert.throws(()=>entries(exercise([row(true),row(true,extra)]),'lb','Arms'));
  assert.equal(entries(exercise([row(false,extra)]),'lb','Arms').length,0);
 }
});
test('camera never guesses squat/curl weight and accepts explicit bodyweight zero',()=>{
 for(const ex of ['squats','bicep_curls']){
  for(const input of ['',' ','-1','NaN','135junk'])assert.throws(()=>weight(ex,input));
  assert.equal(weight(ex,'0'),0);assert.equal(weight(ex,'12.5'),12.5);
 }
 assert.equal(weight('pushups',''),0);assert.equal(weight('boxing',''),0);
});
test('session batch saves together, preserves history, and propagates failed writes',async()=>{
 let stored=JSON.stringify([{id:'old'}]),fail=false,events=0;
 const exports={};const storage={getItem:async()=>stored,setItem:async(_key,value)=>{if(fail)throw Error('Disk full');stored=value}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(__dirname+'/../constants/workoutStorage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports,console,require:name=>{
  if(name==='@react-native-async-storage/async-storage')return storage;
  if(name==='react-native')return {DeviceEventEmitter:{emit:()=>events++}};
  if(name==='./exercisesData.json')return [];
  throw Error(name);
 }});
 const selected=entries(exercise([row(true),row(false)]),'kg','Arms');
 const saved=await exports.saveWorkoutLogBatch('me',selected);
 assert.equal(saved.length,1);assert.equal(JSON.parse(stored).length,2);assert.equal(events,1);
 fail=true;const before=stored;
 await assert.rejects(()=>exports.saveWorkoutLogBatch('me',selected),/Disk full/);
 assert.equal(stored,before);assert.equal(events,1);
});
