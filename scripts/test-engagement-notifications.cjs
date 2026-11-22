const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path'),{createRequire}=require('module');
const repo=path.resolve(__dirname,'..'),ts=createRequire(repo+'/package.json')('typescript');
function fixture(){
 const data=new Map(),pending=new Map(),delivered=[],calls=[],events=[];let granted=true,platform='ios',state='background',handler;
 let meals=[],workouts=[],walks=[],routineCount=1;
 const now=new Date('2026-11-20T10:00:00').getTime();class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const native={SchedulableTriggerInputTypes:{DATE:'date'},IosAuthorizationStatus:{PROVISIONAL:3},AndroidImportance:{DEFAULT:3},
 getPermissionsAsync:async()=>({granted}),requestPermissionsAsync:async()=>({granted}),setNotificationChannelAsync:async()=>{},
 setNotificationHandler:v=>{handler=v},getAllScheduledNotificationsAsync:async()=>[...pending.values()],getPresentedNotificationsAsync:async()=>delivered,
 cancelScheduledNotificationAsync:async id=>{calls.push(['cancel',id]);pending.delete(id)},dismissNotificationAsync:async id=>{calls.push(['dismiss',id])},
 scheduleNotificationAsync:async request=>{calls.push(['schedule',request.identifier]);pending.set(request.identifier,request);return request.identifier}};
 const cache={};function load(name){if(cache[name])return cache[name];const out={};cache[name]=out;
 const staged=__dirname+'/'+name+'.ts',file=fs.existsSync(staged)?staged:repo+'/constants/'+name+'.ts';
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{exports:out,Date:Clock,console,require:n=>{
  if(n==='@react-native-async-storage/async-storage')return {getItem:async k=>data.get(k)||null,setItem:async(k,v)=>{data.set(k,v)}};
  if(n==='react-native')return {Platform:{get OS(){return platform}},AppState:{get currentState(){return state}},DeviceEventEmitter:{emit:(...e)=>events.push(e)}};
  if(n==='expo-notifications')return native;
  if(n==='./engagementPlan')return load('engagementPlan');
  if(n==='./nutritionStorage')return {loadMealLogs:async()=>meals,loadNutritionTargets:async()=>({dailyCalories:2000}),loadSavedQuiz:async()=>({goal:'bulk'})};
  if(n==='./workoutStorage')return {loadWorkoutLogs:async()=>workouts,loadCustomRoutines:async()=>Array(routineCount).fill({})};
  if(n==='./walkStorage')return {loadRecordedWalks:async()=>walks};
  if(n==='./nutritionPetProfile')return {loadNutritionPetProfile:async()=>({name:'Pip'})};throw Error(n);
 }});return out;}
 return {api:load('engagementNotifications'),plan:load('engagementPlan'),pending,data,calls,delivered,events,native,now,setGranted:v=>{granted=v},setPlatform:v=>{platform=v},setState:v=>{state=v},setMeals:v=>{meals=v},setWorkouts:v=>{workouts=v},get handler(){return handler}};
}
const prefs=f=>({...f.plan.DEFAULT_REMINDERS,enabled:true});
(async()=>{
 let f=fixture();await f.api.activateReminderAccount('alice');assert.equal(f.pending.size,0);assert.equal(f.calls.length,0);
 await f.api.saveReminderSettings('alice',prefs(f));await f.api.refreshReminderPlan();assert.ok(f.pending.size>0&&f.pending.size<=14);
 const count=f.calls.length;await f.api.refreshReminderPlan();assert.equal(f.calls.length,count);
 console.log('PASS no automatic opt-in; enabling schedules a bounded plan; repeated refresh is idempotent');
 f.setMeals([{id:'real',dateKey:'2026-11-20',calories:2000,timestamp:f.now-3600000}]);await f.api.refreshReminderPlan();assert.ok(![...f.pending.keys()].some(id=>id.endsWith('2026-11-20:meal')));
 f.setWorkouts([{id:'set',reps:10,date:new Date(f.now-3600000).toISOString()}]);await f.api.refreshReminderPlan();assert.ok(![...f.pending.keys()].some(id=>id.endsWith('2026-11-20:workout')));
 console.log('PASS real meal and workout changes cancel stale pending reminders');
 f.pending.set('unrelated',{identifier:'unrelated',content:{data:{owner:'alice'}}});
 await f.api.sendTestReminder('alice');assert.ok([...f.pending.keys()].some(id=>id.endsWith(':test')));await f.api.refreshReminderPlan();assert.ok([...f.pending.keys()].some(id=>id.endsWith(':test')));
 console.log('PASS test notification survives the background refresh and leaves unrelated notifications alone');
 await f.api.saveReminderSettings('alice',{...prefs(f),enabled:false});await f.api.refreshReminderPlan();assert.equal(f.pending.size,1);assert.ok(f.pending.has('unrelated'));
 console.log('PASS disabling cancels only Footprint engagement reminders, including scheduled tests');
 await f.api.saveReminderSettings('alice',prefs(f));await f.api.refreshReminderPlan();f.delivered.push({request:{identifier:[...f.pending.keys()].find(k=>k!=='unrelated'),content:{data:{owner:'alice'}}}});
 await f.api.activateReminderAccount('bob');assert.ok([...f.pending.values()].every(n=>n.content.data.owner!=='alice'||n.identifier==='unrelated'));assert.ok(f.calls.some(c=>c[0]==='dismiss'));
 assert.equal((await f.api.loadReminderSettings('bob')).enabled,false);await f.api.activateReminderAccount('alice');assert.ok(f.pending.size>1);
 await f.api.activateReminderAccount(null);assert.equal(f.pending.size,1);
 console.log('PASS switching accounts/signing out removes old reminders and delivered banners; preferences stay account-specific');
 f=fixture();await f.api.saveReminderSettings('alice',prefs(f));f.setGranted(false);await f.api.activateReminderAccount('alice');assert.equal(f.pending.size,0);assert.equal(await f.api.requestReminderPermission(),false);
 console.log('PASS denied permission creates no notifications and no fabricated success');
 f=fixture();await f.api.saveReminderSettings('alice',prefs(f));const a=f.api.activateReminderAccount('alice'),b=f.api.activateReminderAccount('bob');await Promise.all([a,b]);assert.equal(f.pending.size,0);assert.equal(f.api.reminderOwner(),'bob');
 console.log('PASS an in-flight old-account refresh cannot schedule notifications for the wrong account');
 f.api.configureReminderPresentation();f.setState('active');let result=await f.handler.handleNotification({request:{content:{data:{owner:'bob'}}}});assert.equal(result.shouldShowBanner,false);
 f.setState('background');result=await f.handler.handleNotification({request:{content:{data:{owner:'bob'}}}});assert.equal(result.shouldShowBanner,true);
 result=await f.handler.handleNotification({request:{content:{data:{owner:'alice'}}}});assert.equal(result.shouldShowBanner,false);
 console.log('PASS foreground reminders stay quiet and foreign-account banners are suppressed');
 f=fixture();f.setPlatform('web');await f.api.activateReminderAccount('alice');await f.api.refreshReminderPlan();assert.equal(f.calls.length,0);assert.equal(await f.api.reminderPermission(),false);
 console.log('PASS web gracefully avoids unsupported native notification APIs');
})().catch(e=>{console.error(e);process.exitCode=1});
