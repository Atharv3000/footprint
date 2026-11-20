const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path'),{createRequire}=require('module');
const repo=require('path').resolve(__dirname,'..'),ts=createRequire(repo+'/package.json')('typescript'),api={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(repo+'/constants/exerciseMotion.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:api});
const catalog=JSON.parse(fs.readFileSync(repo+'/constants/exerciseVectorPoses.json','utf8'));
let samples=0;
for(const demo of Object.values(catalog))for(let k=0;k<=20;k++){
 const progress=k/20,actual=api.sampleExercisePose(demo.frames,progress),position=progress*(demo.frames.length-1),lo=Math.floor(position),hi=Math.min(demo.frames.length-1,lo+1),fraction=position-lo;
 for(let joint=0;joint<17;joint++)for(let axis=0;axis<2;axis++)assert.ok(Math.abs(actual[joint][axis]-(demo.frames[lo][joint][axis]*(1-fraction)+demo.frames[hi][joint][axis]*fraction))<1e-8);
 assert.ok(Math.abs(api.resolveJointCoordinate(actual,{indices:[3,4],axis:1,offset:2})-((actual[3][1]+actual[4][1])/2+2))<1e-8);samples++;
}
assert.equal(api.resolveJointCoordinate([[1,2]],7),7);
console.log(`PASS UI-thread animation matches original joint geometry at ${samples} sampled poses across all 873 illustrations`);
