const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path'),{createRequire}=require('module');
const repo=path.resolve(__dirname,'..'),ts=createRequire(repo+'/package.json')('typescript');const source=fs.existsSync(__dirname+'/EngagementNotifications.tsx')?__dirname+'/EngagementNotifications.tsx':repo+'/components/EngagementNotifications.tsx';
const effects=[],pushes=[],subscriptions=[];let owner='alice',handler;
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{
 exports:out,setTimeout,clearTimeout,require:n=>{
 if(n==='react')return {useEffect:f=>effects.push(f)};
 if(n==='react-native')return {Platform:{OS:'ios'},AppState:{addEventListener:()=>({remove(){}})},DeviceEventEmitter:{addListener:()=>({remove(){}})}};
 if(n==='expo-router')return {router:{push:v=>pushes.push(v)}};
 if(n==='expo-notifications')return {DEFAULT_ACTION_IDENTIFIER:'default',addNotificationResponseReceivedListener:f=>{handler=f;return {remove(){}}},getLastNotificationResponseAsync:async()=>null,clearLastNotificationResponseAsync:async()=>{}};
 if(n==='@/constants/AuthContext')return {useAuth:()=>({user:{id:'alice'},profile:{hasCompletedSetup:true},isLoading:false})};
 if(n==='@/constants/engagementNotifications')return {configureReminderPresentation(){},activateReminderAccount:async v=>{owner=v},recordReminderAppOpen:async()=>{},refreshReminderPlan:async()=>{},reminderOwner:()=>owner,REMINDERS_CHANGED:'prefs'};
 return {MEAL_LOGS_CHANGED:'meals',WORKOUT_LOGS_CHANGED:'workouts',WALKS_CHANGED:'walks'};
 }});
out.EngagementNotifications();for(const effect of effects)subscriptions.push(effect());
const response=(id,data)=>({actionIdentifier:'default',notification:{request:{identifier:id,content:{data:{source:'engagement',owner:'alice',...data}}}}});
handler(response('pet',{route:'nutrition',pet:true}));assert.equal(pushes.length,1);assert.equal(pushes[0].params.section,'pet');
handler(response('pet',{route:'nutrition',pet:true}));assert.equal(pushes.length,1);
handler(response('workout',{route:'log'}));assert.equal(pushes[1],'/(tabs)/log');
handler(response('foreign',{owner:'bob',route:'log'}));handler(response('unsafe',{route:'https://example.com'}));assert.equal(pushes.length,2);
owner=null;handler(response('signedout',{route:'log'}));assert.equal(pushes.length,2);
for(const cleanup of subscriptions)if(cleanup)cleanup();
console.log('PASS real notification response handler opens Pip/workouts once, rejects foreign accounts, signed-out taps and arbitrary URLs, and cleans listeners');
