const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const data=new Map(),secure=new Map(),events=[],calls=[];
let offline=false;
const fixture={code:'ABCDEF123456',title:'Team steps',countryId:'SQUAD',goalSteps:10000,totalSteps:0,startsAt:'2026-11-16T00:00:00Z',endsAt:'2027-01-01T00:00:00Z',joinedAt:'2026-11-16T00:00:00Z',status:'active',left:false,isOwner:true,you:'me',members:[{id:'me',name:'Me',steps:0,left:false}]};
const cache={};function load(file){if(cache[file])return cache[file];const exports={};cache[file]=exports;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('constants/'+file+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,console,Date,setTimeout,clearTimeout,AbortController,process:{env:{EXPO_PUBLIC_REP_TOKEN:'fixture'}},require:name=>{
 if(name.includes('async-storage'))return {__esModule:true,default:{getItem:async key=>data.get(key)||null,setItem:async(key,value)=>{data.set(key,value)}}};
 if(name==='expo-secure-store')return {getItemAsync:async key=>secure.get(key)||null,setItemAsync:async(key,value)=>{secure.set(key,value)}};
 if(name==='expo-crypto')return {randomUUID:()=> 'a'.repeat(36)};
 if(name==='react-native')return {DeviceEventEmitter:{emit:(...args)=>events.push(args)}};
 if(name==='./repTrackerProtocol')return {repServerUrl:()=> 'https://fixture/rep-api'};
 if(name.startsWith('./'))return load(name.slice(2));
 throw Error(name);
},fetch:async(_url,options)=>{
 if(offline)throw Error('Offline'); const body=JSON.parse(options.body);calls.push(body);
 if(body.action==='sync'){fixture.totalSteps=body.steps;fixture.members[0].steps=body.steps;}
 return {ok:true,json:async()=>JSON.parse(JSON.stringify(fixture))};
}});return exports;}
const progress=load('communityGoalProgress'),api=load('communityGoals'),walkApi=load('walkStorage');
const now=new Date(2026,10,18,16),record=(id,steps,date=new Date(2026,10,18,12),extra={})=>({id,userId:'me',date:date.toISOString(),steps,durationSeconds:600,distanceMeters:steps/1.31,activityType:'walk',...extra});
const plain=value=>JSON.parse(JSON.stringify(value));
test('daily and Monday-based weekly goals recompute from eligible records, not example progress',()=>{
 const walks=[record('a',1000),record('b',2000,new Date(2026,10,16,10)),record('old',9000,new Date(2026,10,15,10)),record('a',1000),record('demo_walk',9000),record('ride',9000,undefined,{activityType:'cycle'}),record('other',9000,undefined,{userId:'other'}),record('future',9000,new Date(2026,10,19,10))];
 const goals=progress.personalGoalProgress(walks,'me',{daily:4000,weekly:15000},now);
 assert.equal(goals[0].current,1000);assert.equal(goals[1].current,3000);
 assert.equal(progress.personalGoalProgress(walks,'me',{daily:4000,weekly:15000},new Date(2026,10,19,16))[0].current,9000);
 assert.equal(progress.personalGoalProgress([], 'me',{daily:4000,weekly:15000},now)[0].current,0);
});
test('a finished walk reports its delta and only newly crossed completions',()=>{
 const old=record('old',3500),walk=record('new',1000);
 const gains=progress.walkGoalGains([old,walk,walk],walk,{daily:4000,weekly:15000},now);
 assert.equal(gains[0].before,3500);assert.equal(gains[0].current,4500);assert.equal(gains[0].added,1000);assert.equal(gains[0].completedNow,true);
 assert.equal(gains[1].added,1000);assert.equal(gains[1].completedNow,false);
 const later=record('later',500);
 assert.equal(progress.walkGoalGains([old,walk,later],later,{daily:4000,weekly:15000},now)[0].completedNow,false);
 assert.equal(progress.walkGoalGains([record('ride',1000,undefined,{activityType:'cycle'})],record('ride',1000,undefined,{activityType:'cycle'}),{daily:4000,weekly:15000},now).length,0);
});
test('calendar boundaries respect local midnight, weeks, and daylight-saving changes',()=>{
 for(const date of [new Date(2026,10,1,15),new Date(2027,0,1,12)]){
  const windows=progress.goalWindows(date);assert.equal(windows.day.getHours(),0);assert.equal(windows.week.getDay(),1);assert.equal(windows.nextWeek.getDay(),1);assert.equal(windows.nextDay.getHours(),0);assert.ok(+windows.week<=+date&&+date<+windows.nextWeek);
 }
});
test('personal targets persist by account and reject invalid targets',async()=>{
 await api.saveGoalTargets('me',{daily:5000,weekly:25000});assert.equal((await api.loadGoalTargets('me')).daily,5000);assert.equal((await api.loadGoalTargets('other')).daily,4000);
 await assert.rejects(()=>api.saveGoalTargets('me',{daily:0,weekly:NaN}));assert.ok(events.some(event=>event[0]===api.COMMUNITY_GOALS_CHANGED));
});
test('saved walk reaches personal and shared goals, retries never duplicate, offline progress is pending',async()=>{
 const at=new Date();fixture.startsAt=new Date(+at-86400000).toISOString();fixture.joinedAt=fixture.startsAt;fixture.endsAt=new Date(+at+6*86400000).toISOString();
 const saved=await walkApi.saveWalk('me',{durationSeconds:600,distanceMeters:765,steps:1000,calories:50,avgPace:'10:00',activityType:'walk',routeCoordinates:[]});
 await api.createSquadGoal('me','Me','Team steps',10000);
 let personal;
 const result=await api.progressFromSavedWalk('me',saved,value=>{personal=value});
 assert.equal(personal.length,2);assert.equal(result.gains.length,3);assert.equal(result.gains[2].added,1000);
 await api.syncSquadGoal('me');assert.equal(fixture.totalSteps,1000);
 const second=await walkApi.saveWalk('me',{durationSeconds:600,distanceMeters:765,steps:1000,calories:50,avgPace:'10:00',activityType:'run',routeCoordinates:[]});
 assert.notEqual(second.id,saved.id);offline=true;
 const pending=await api.progressFromSavedWalk('me',second);assert.equal(pending.gains[2].pending,true);assert.equal(pending.gains[2].completedNow,false);assert.match(pending.syncError,/Walk saved/);offline=false;
 await api.syncSquadGoal('me');assert.equal(fixture.totalSteps,2000);
 assert.ok(!data.get('@footprint_squad_goal_me').includes('a'.repeat(72)));
 await walkApi.deleteWalk('me',second.id);await api.syncSquadGoal('me');assert.equal(fixture.totalSteps,1000);
});
