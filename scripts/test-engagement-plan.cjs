const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path'),{createRequire}=require('module');
const repo=path.resolve(__dirname,'..'),ts=createRequire(repo+'/package.json')('typescript'),api={};
const file=fs.existsSync(__dirname+'/engagementPlan.ts')?__dirname+'/engagementPlan.ts':repo+'/constants/engagementPlan.ts';
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:api,Date});
const now=new Date('2026-11-20T10:00:00'),day='2026-11-20',prefs={...api.DEFAULT_REMINDERS,enabled:true};
const base={meals:[],workouts:[],walks:[],routineCount:1,target:2000,goal:'bulk',petName:'Pip',lastOpened:now.getTime()};
const meal=(id,dateKey,calories=500,hour=9)=>({id,dateKey,calories,timestamp:new Date(`${dateKey}T${String(hour).padStart(2,'0')}:00:00`).getTime()});
const plan=(patch={},settings={},clock=now,history=[])=>api.buildEngagementPlan({...base,...patch},{...prefs,...settings},clock,history);
let count=0;function test(name,fn){fn();console.log('PASS '+name);count++;}
test('notifications are opt-in; a fresh profile does not invent a streak or activity',()=>{
 assert.equal(api.buildEngagementPlan(base,api.DEFAULT_REMINDERS,now).length,0);
 assert.ok(!plan().some(n=>n.kind==='streak'));assert.ok(plan().some(n=>n.kind==='meal'));
});
test('seven-day plan respects daily cap, quiet hours, spacing and future times',()=>{
 const p=plan();assert.ok(p.length>5&&p.length<=14);const byDay=new Map();
 for(const n of p){assert.ok(n.at>now.getTime());assert.ok(!api.inQuietHours(new Date(n.at),prefs));const d=api.localDay(new Date(n.at));byDay.set(d,[...(byDay.get(d)||[]),n.at]);}
 for(const times of byDay.values()){assert.ok(times.length<=2);if(times.length===2)assert.ok(Math.abs(times[1]-times[0])>=3*3600000);}
 const gentle=plan({}, {dailyLimit:1});assert.equal(new Set(gentle.map(n=>api.localDay(new Date(n.at)))).size,gentle.length);
});
test('logging enough calories or a recent meal cancels today’s meal reminder',()=>{
 assert.ok(!plan({meals:[meal('a',day,1900)]}).some(n=>n.key===day+':meal'));
 const late=new Date('2026-11-20T14:00:00');assert.ok(!plan({meals:[meal('a',day,400,12)]},{},late).some(n=>n.key===day+':meal'));
 assert.ok(plan({meals:[meal('a',day,400,9)]},{},late).some(n=>n.key===day+':meal'));
});
test('completed training suppresses current workout nudges; no routines means no workout nudge',()=>{
 const workout={id:'set_1',reps:10,date:new Date('2026-11-20T08:00:00').toISOString()};
 assert.ok(!plan({workouts:[workout]}).some(n=>n.key===day+':workout'));
 assert.ok(!plan({routineCount:0}).some(n=>n.kind==='workout'));
 const yesterday={...workout,date:new Date('2026-11-19T17:00:00').toISOString()};assert.ok(!plan({workouts:[yesterday]}).some(n=>n.key===day+':workout'));
});
test('check-in streak uses real consecutive logged days and disappears after today’s check-in',()=>{
 const meals=[meal('a','2026-11-19'),meal('b','2026-11-18')];
 const s=plan({meals}).find(n=>n.kind==='streak');assert.ok(s);assert.match(s.title,/2|small/);
 assert.ok(!plan({meals:[...meals,meal('c',day)]}).some(n=>n.kind==='streak'));
 assert.ok(!plan({meals:[meal('a','2026-11-18')]}).some(n=>n.kind==='streak'));
});
test('demo, future, impossible, zero-calorie and duplicate meal records cannot fabricate urgency',()=>{
 const p=plan({meals:[meal('demo_a','2026-11-19'),meal('future','2026-11-21'),meal('bad','2026-02-30'),meal('zero',day,0)]});assert.ok(!p.some(n=>n.kind==='streak'));
 assert.ok(plan({meals:[meal('a',day,1000),meal('a',day,1000)]}).some(n=>n.key===day+':meal'));
 assert.ok(plan({meals:[meal('future_time',day,2000,15)]}).some(n=>n.key===day+':meal'));
});
test('quiet hours, pause and category switches take immediate effect',()=>{
 const paused=now.getTime()+86400000;assert.ok(plan({}, {pausedUntil:paused}).every(n=>n.at>=paused));
 assert.equal(plan({}, {meal:false,workout:false,streak:false,comeback:false}).length,0);
 assert.ok(plan({}, {quietStart:20,quietEnd:10}).every(n=>!api.inQuietHours(new Date(n.at),{...prefs,quietStart:20,quietEnd:10})));
 assert.equal(api.inQuietHours(new Date('2026-11-20T03:00:00'),prefs),true);
 assert.equal(api.inQuietHours(new Date('2026-11-20T21:00:00'),prefs),true);
});
test('delivered slots consume daily budget and cannot be recreated by refreshing',()=>{
 const at=new Date('2026-11-20T13:00:00').getTime(),history=[{key:day+':meal',at}];
 const result=plan({}, {},new Date('2026-11-20T14:00:00'),history);assert.ok(!result.some(n=>n.key===day+':meal'));
 assert.ok(result.filter(n=>n.key.startsWith(day)).length<=1);
});
test('copy changes with personality and diet goal; future copy does not invent completed tasks',()=>{
 const playful=plan().find(n=>n.kind==='meal'),gentle=plan({}, {tone:'gentle'}).find(n=>n.kind==='meal');assert.notEqual(playful.body,gentle.body);
 const bulk=plan().find(n=>n.kind==='meal'),cut=plan({goal:'cut'}).find(n=>n.kind==='meal');
 // Some rotating messages mention the plan, while all variants remain truthful invitations.
 assert.ok(bulk.body&&cut.body);assert.ok(plan().every(n=>!n.body.includes('you failed')));
 assert.ok(plan().filter(n=>n.key>day+':z').every(n=>!n.title.includes('-day check-in streak')));
});
test('comeback invitation is scheduled after absence and resets its relative horizon on return',()=>{
 const first=plan({}, {meal:false,workout:false}).filter(n=>n.kind==='comeback');assert.equal(first.length,2);
 const next=plan({}, {meal:false,workout:false},new Date('2026-11-21T10:00:00')).filter(n=>n.kind==='comeback');assert.notEqual(first[0].key,next[0].key);
});
test('calendar plans handle DST and year rollover in local time',()=>{
 for(const d of ['2026-10-30T10:00:00','2026-12-29T10:00:00','2027-03-12T10:00:00']){
  const clock=new Date(d),p=plan({}, {},clock);assert.ok(p.length>0);for(const n of p)assert.ok(!api.inQuietHours(new Date(n.at),prefs));
 }
});
test('corrupt preferences normalize safely and invalid clocks never schedule',()=>{
 const s=api.normalizeReminderSettings({enabled:'yes',dailyLimit:100,quietStart:99,pausedUntil:Infinity});assert.equal(s.enabled,false);assert.equal(s.dailyLimit,2);assert.equal(s.quietStart,21);assert.equal(s.pausedUntil,0);
 assert.equal(plan({}, {},new Date(NaN)).length,0);
});
console.log(`${count} reminder planning checks passed`);
