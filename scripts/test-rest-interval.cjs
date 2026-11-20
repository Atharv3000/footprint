const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path'),{createRequire}=require('module');const repo=path.resolve(__dirname,'..'),req=createRequire(repo+'/package.json'),ts=req('typescript');
function app(){
 const values=[],dependencies=[],effects=[],data=new Map(),alerts=[],finishes=[];let index=0,fail=false;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const hooks={memo:c=>c,useCallback:f=>f,useState:initial=>{const i=index++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v}]},useRef:initial=>{const i=index++;return values[i]??(values[i]={current:initial})},useMemo:f=>f(),useEffect:(fn,deps)=>{const i=index++;if(!same(dependencies[i],deps)){dependencies[i]=deps;effects.push(fn)}}};
 class Value{constructor(v){this.v=v}interpolate({outputRange}){return outputRange[0]}setValue(v){this.v=v}}
 const definitions=[{id:'bench_press',name:'Bench Press',category:'chest',defaultWeight:100,defaultReps:10,primaryMuscles:['chest']},{id:'bicep_curls',name:'Bicep Curls',category:'arms',defaultWeight:50,defaultReps:10,primaryMuscles:['biceps']}];
 const native={StyleSheet:{create:x=>x},View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',ScrollView:'ScrollView',TextInput:'TextInput',Platform:{OS:'ios'},Animated:{Value,View:'Animated.View'},Alert:{alert:(...x)=>alerts.push(x)},DeviceEventEmitter:{emit(){}}};
 const storage={getItem:async k=>data.get(k)??null,setItem:async(k,v)=>{if(fail)throw Error('Disk full');data.set(k,v)}};
 const cache={};function load(rel){if(cache[rel])return cache[rel];const out={};cache[rel]=out;const staged=path.join(__dirname,path.basename(rel)),file=fs.existsSync(staged)?staged:repo+'/'+rel;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports:out,console,Date,Math,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},require:n=>{
 if(n==='react')return hooks;if(n==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
 if(n==='react-native')return native;if(n==='@react-native-async-storage/async-storage')return storage;
 if(n==='@expo/vector-icons')return {Ionicons:'Icon'};if(n==='expo-haptics')return {selectionAsync:async()=>{},notificationAsync:async()=>{},impactAsync:async()=>{},NotificationFeedbackType:{Success:'success'},ImpactFeedbackStyle:{Light:'light'}};
 if(n==='react-native-svg')return {__esModule:true,default:'Svg',Path:'Path',Text:'SvgText'};
 if(n==='@/components/AppModal')return {AppModal:'Modal'};if(n==='@/components/ExerciseDemo')return {ExerciseDemo:'ExerciseDemo'};
 if(n==='@/constants/ThemeContext')return {useTheme:()=>({isDark:true,colors:{background:'#09090b',surfaceElevated:'#18181b',card:'#222',border:'#333',text:'#fff',textMuted:'#999',textSecondary:'#bbb',primary:'#a3e635',surfaceSecondary:'#27272a'}}),BRAND_ROUNDED_FONT:'Arial',BRAND_ROUNDED_FONT_EXTRA:'Arial'};
 if(n==='./exercisesData.json')return definitions;
 if(n.startsWith('@/constants/'))return load('constants/'+n.split('/').at(-1)+'.ts');
 if(n==='./accountRecords')return load('constants/accountRecords.ts');throw Error(n);
 }});return out;}
 const props={visible:true,embedded:true,routine:{id:'chest',title:'Chest',category:'chest',color:'#a3e635',exercises:[{exerciseId:'bench_press',reps:10,weight:100},{exerciseId:'bicep_curls',reps:10,weight:50}]},allLogs:[],userId:'alice',weightUnit:'lb',onClose(){},onFinishSession:(...v)=>finishes.push(v)};
 const Session=load('components/WorkoutSessionModal.tsx').WorkoutSessionModal;
 function render(){index=0;let tree=Session(props);while(effects.length){effects.shift()();index=0;tree=Session(props)}return tree;}
 function all(node,result=[]){if(!node)return result;if(Array.isArray(node)){for(const n of node)all(n,result);return result}if(typeof node==='object'){result.push(node);if(node.type?.name==='SessionExerciseCard')all(node.type(node.props),result);else all(node.props?.children,result)}return result}
 const byID=(tree,id)=>all(tree).find(n=>n.props?.testID===id);const text=tree=>{const out=[];function visit(n){if(Array.isArray(n))n.forEach(visit);else if((typeof n==='string'||typeof n==='number'))out.push(String(n));else if(n&&typeof n==='object'){if(n.type?.name==='SessionExerciseCard')visit(n.type(n.props));else if(n.type?.name==='RestCountdown'){out.push(String(Math.max(0,Math.ceil((n.props.endAt-Date.now())/1000))));out.push('s')}else visit(n.props?.children)}}visit(tree);return out.join(' ')};
 return {props,load,render,byID,all,text,data,alerts,finishes,setFail:v=>fail=v,rankApi:()=>load('constants/muscleRanks.ts')};
}

const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};
(async()=>{
let a=app(),tree=a.render();await flush();tree=a.render();
assert.match(a.text(a.byID(tree,'rest-interval-settings')),/1:00/);
a.byID(tree,'rest-interval-settings').props.onPress();tree=a.render();
a.byID(tree,'rest-preset-90').props.onPress();await flush();tree=a.render();
assert.match(a.text(a.byID(tree,'rest-interval-settings')),/1:30/);
assert.equal(JSON.parse(a.data.get('@footprint_workout_rest_v1:alice')),90);
a.byID(tree,'complete-set-0-0').props.onPress();tree=a.render();assert.ok(a.text(tree).includes('90 s'));
console.log('PASS selecting a duration persists it and completing a set starts that exact interval');
a.byID(tree,'rest-current-more').props.onPress();tree=a.render();assert.ok(a.text(tree).includes('105 s'));
a.byID(tree,'rest-current-less').props.onPress();tree=a.render();assert.ok(a.text(tree).includes('90 s'));
assert.equal(JSON.parse(a.data.get('@footprint_workout_rest_v1:alice')),90);
a.byID(tree,'rest-preset-120').props.onPress();await flush();tree=a.render();assert.ok(a.text(tree).includes('90 s'));
console.log('PASS running timer adjustments preserve preference; changing preference leaves current countdown intact');
a.byID(tree,'rest-preset-0').props.onPress();await flush();tree=a.render();assert.ok(!a.byID(tree,'rest-skip'));
a.byID(tree,'complete-set-1-0').props.onPress();tree=a.render();assert.ok(!a.byID(tree,'rest-skip'));
assert.equal(JSON.parse(a.data.get('@footprint_workout_rest_v1:alice')),0);
console.log('PASS Off stops a running countdown and completing future sets does not start rest');
a.byID(tree,'rest-interval-more').props.onPress();await flush();tree=a.render();
a.byID(tree,'complete-set-0-0').props.onPress();tree=a.render();assert.ok(!a.byID(tree,'rest-skip'));
a.byID(tree,'complete-set-0-0').props.onPress();tree=a.render();assert.ok(a.text(tree).includes('15 s'));
a.byID(tree,'rest-current-less').props.onPress();tree=a.render();assert.ok(!a.byID(tree,'rest-skip'));
console.log('PASS custom 15-second steps work; unchecking never starts rest; reducing remaining time to zero stops it');
a.byID(tree,'rest-preset-180').props.onPress();await flush();a.props.visible=false;a.render();a.props.visible=true;tree=a.render();assert.match(a.text(a.byID(tree,'rest-interval-settings')),/3:00/);
a.props.userId='bob';tree=a.render();await flush();tree=a.render();assert.match(a.text(a.byID(tree,'rest-interval-settings')),/1:00/);
a.props.userId='alice';tree=a.render();await flush();tree=a.render();assert.match(a.text(a.byID(tree,'rest-interval-settings')),/3:00/);
console.log('PASS duration survives session reopening and is isolated per account');
a.byID(tree,'rest-interval-settings').props.onPress();tree=a.render();a.setFail(true);a.byID(tree,'rest-preset-30').props.onPress();await flush();tree=a.render();assert.match(a.text(a.byID(tree,'rest-interval-settings')),/0:30/);assert.equal(a.alerts.at(-1)[0],'Rest interval not saved');
console.log('PASS a failed preference write keeps session usable and reports that persistence failed');
const api=a.load('constants/workoutRest.ts');
for(const [input,wanted] of [[-100,0],[0,0],[22,15],[38,45],[601,600],[NaN,60],[Infinity,60],['90',60]])assert.equal(api.normalizeRestSeconds(input),wanted);
a.setFail(false);await Promise.all([api.saveRestInterval('alice',30),api.saveRestInterval('alice',90),api.saveRestInterval('alice',120)]);assert.equal(await api.loadRestInterval('alice'),120);
a.data.set('@footprint_workout_rest_v1:broken','oops');assert.equal(await api.loadRestInterval('broken'),60);
assert.equal(api.formatRestInterval(600),'10:00');assert.equal(api.formatRestInterval(0),'Off');
console.log('PASS duration bounds, corrupt storage, formatting and rapid-write ordering');
})().catch(e=>{console.error(e);process.exitCode=1});
