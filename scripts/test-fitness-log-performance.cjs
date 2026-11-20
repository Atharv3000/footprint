const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path'),{createRequire}=require('module');const repo=path.resolve(__dirname,'..'),req=createRequire(repo+'/package.json'),ts=req('typescript');
function app(){
 const values=[],dependencies=[],effects=[],data=new Map(),alerts=[],finishes=[];let index=0,fail=false;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const hooks={memo:c=>c,useCallback:f=>f,useState:initial=>{const i=index++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v}]},useRef:initial=>{const i=index++;return values[i]??(values[i]={current:initial})},useMemo:f=>f(),useEffect:(fn,deps)=>{const i=index++;if(!same(dependencies[i],deps)){dependencies[i]=deps;effects.push(fn)}}};
 class Value{constructor(v){this.v=v}interpolate({outputRange}){return outputRange[0]}setValue(v){this.v=v}}
 const smallDefinitions=[{id:'bench_press',name:'Bench Press',category:'chest',defaultWeight:100,defaultReps:10,primaryMuscles:['chest']},{id:'bicep_curls',name:'Bicep Curls',category:'arms',defaultWeight:50,defaultReps:10,primaryMuscles:['biceps']}];
 const definitions=JSON.parse(fs.readFileSync(repo+'/constants/exercisesData.json','utf8'));
 const native={StyleSheet:{create:x=>x},View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',ScrollView:'ScrollView',FlatList:'FlatList',TextInput:'TextInput',Platform:{OS:'ios'},Animated:{Value,View:'Animated.View'},Alert:{alert:(...x)=>alerts.push(x)},DeviceEventEmitter:{emit(){}}};
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
 const byID=(tree,id)=>all(tree).find(n=>n.props?.testID===id);const text=tree=>{const out=[];function visit(n){if(Array.isArray(n))n.forEach(visit);else if(typeof n==='string')out.push(n);else if(n&&typeof n==='object'){if(n.type?.name==='SessionExerciseCard')visit(n.type(n.props));else if(n.type?.name==='RestCountdown'){out.push(String(Math.max(0,Math.ceil((n.props.endAt-Date.now())/1000))));out.push('s')}else visit(n.props?.children)}}visit(tree);return out.join(' ')};
 return {render,byID,all,text,data,alerts,finishes,setFail:v=>fail=v,rankApi:()=>load('constants/muscleRanks.ts')};
}

const a=app();const started=performance.now();let tree=a.render();const count=a.all(tree).length;
const hiddenList=a.byID(tree,'session-exercise-catalog');if(!process.env.PERF_BASELINE)assert.equal(hiddenList,undefined);
const add=a.all(tree).find(n=>n.props?.onPress&&a.text(n).startsWith('Add Exercise Browse'));
assert.ok(add,'Missing Add Exercise control');add.props.onPress();tree=a.render();
if(!process.env.PERF_BASELINE){const list=a.byID(tree,'session-exercise-catalog');assert.equal(list.props.data.length,885);assert.equal(list.props.initialNumToRender,8);assert.equal(list.props.maxToRenderPerBatch,8);const row=list.props.renderItem({item:list.props.data[0],index:0});assert.ok(row.props.onPress);row.props.onPress();tree=a.render();const current=a.byID(tree,'session-exercise-catalog');const row2=current.props.renderItem({item:current.props.data[0],index:0});const addButton=a.all(row2).find(n=>n.props?.onPress&&a.text(n)==='Add');assert.ok(addButton);addButton.props.onPress();tree=a.render();assert.equal(a.byID(tree,'session-exercise-catalog'),undefined);assert.ok(a.byID(tree,'complete-set-2-0'),'New exercise not added to session');}
const ms=performance.now()-started;console.log(JSON.stringify({baseline:!!process.env.PERF_BASELINE,catalog:885,closedSessionElements:count,openedPickerElements:a.all(tree).length,harnessTimeMs:+ms.toFixed(1)}));
