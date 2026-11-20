const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path'),{createRequire}=require('module');
const repo=require('path').resolve(__dirname,'..'),ts=createRequire(repo+'/package.json')('typescript');
const source=fs.readFileSync(repo+'/components/WorkoutSessionModal.tsx','utf8'),ast=ts.createSourceFile('session.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='RestCountdown')fn=node.initializer.arguments[0].getText(ast);ts.forEachChild(node,visit)}visit(ast);
let now=100000,seconds=0,effect,interval,cleared=0,finished=0,haptics=0;
const jsx=(type,props)=>({type,props}),out={};
vm.runInNewContext(ts.transpileModule('exports.Countdown='+fn,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
exports:out,Date:{now:()=>now},Math,styles:{restTimerText:{}},Text:'Text',useState:initial=>[seconds=typeof initial==='function'?initial():seconds,v=>{seconds=v}],useEffect:f=>{effect=f},
setInterval:f=>{interval=f;return 1},clearInterval:()=>{cleared++},Haptics:{notificationAsync:()=>{haptics++;return Promise.resolve()},NotificationFeedbackType:{Warning:'warning'}},require:()=>({jsx,jsxs:jsx})});
out.Countdown({endAt:190000,onFinish:()=>{finished++},color:'green'});let cleanup=effect();assert.equal(seconds,90);
now=112000;interval();assert.equal(seconds,78);assert.equal(finished,0);
now=200000;interval();assert.equal(seconds,0);assert.equal(finished,1);interval();assert.equal(finished,1);assert.equal(haptics,1);cleanup();assert.equal(cleared,1);
// Extending the timer starts from a new deadline and expiry catches up after a suspended app.
out.Countdown({endAt:230000,onFinish:()=>{finished++},color:'green'});cleanup=effect();assert.equal(seconds,30);
now=300000;interval();assert.equal(seconds,0);assert.equal(finished,2);cleanup();
console.log('PASS isolated rest countdown uses wall-clock deadlines, catches up after suspension, expires once and clears timers');
