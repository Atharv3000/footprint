const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const output={};
const catalog=JSON.parse(fs.readFileSync('constants/exerciseVectorPoses.json','utf8'));
vm.runInNewContext(ts.transpileModule(fs.readFileSync('constants/exerciseVector.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{exports:output,require:()=>catalog});
const resolve=folder=>output.exerciseVector('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'+folder+'/0.jpg');
test('all 885 built-in exercises resolve to bundled vector geometry',()=>{
 const rows=JSON.parse(fs.readFileSync('constants/exercisesData.json','utf8'));
 assert.ok(rows.length>=885);
 for(const row of rows)assert.ok(output.exerciseVector(row.imageUrl),row.name);
 assert.equal(Object.keys(catalog).length,873);
});
test('all poses have seventeen finite joints inside the illustration canvas',()=>{
 for(const [name,demo] of Object.entries(catalog)){
  assert.ok(demo.frames.length>=2,name);
  for(const frame of demo.frames){assert.equal(frame.length,17,name);for(const point of frame){assert.equal(point.length,2,name);assert.ok(point.every(n=>Number.isFinite(n)&&n>=0&&n<=100),name);}}
 }
});
test('unknown images cannot accidentally select another exercise animation',()=>{
 for(const uri of [undefined,'https://example.com/0.jpg','https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Unknown/0.jpg'])assert.equal(output.exerciseVector(uri),null);
});
test('curl bends the forearm while keeping elbow and shoulder anchored',()=>{
 const [a,b]=resolve('Dumbbell_Bicep_Curl').frames;
 assert.deepEqual(a[3],b[3]);assert.deepEqual(a[5],b[5]);assert.ok(b[7][1]<a[7][1]);
});
test('squat lowers the hips with planted feet',()=>{
 const [a,b]=resolve('Barbell_Full_Squat').frames;
 assert.ok(b[9][1]>a[9][1]);assert.deepEqual(a[13],b[13]);assert.deepEqual(a[15],b[15]);
});
test('bench press keeps a horizontal torso and moves hands above chest',()=>{
 const demo=resolve('Barbell_Bench_Press_-_Medium_Grip'),[a,b]=demo.frames;
 assert.equal(demo.support,'bench');assert.ok(Math.abs(a[3][1]-a[9][1])<5);assert.deepEqual(a[9],b[9]);assert.ok(a[7][1]<b[7][1]);
});
test('leg curl raises the ankles with knees anchored; pushup keeps hands planted',()=>{
 let [a,b]=resolve('Lying_Leg_Curls').frames;
 assert.deepEqual(a[11],b[11]);assert.ok(b[13][1]<a[13][1]);
 [a,b]=resolve('Pushups').frames;assert.deepEqual(a[7],b[7]);assert.ok(b[3][1]>a[3][1]);
});
test('cyclic ankle and bicycle poses end exactly where they start',()=>{
 for(const name of ['Ankle_Circles','Bicycling']){const demo=resolve(name),a=demo.frames[0],b=demo.frames.at(-1);assert.ok(demo.cyclic);assert.ok(demo.frames.length>=5);a.forEach((p,i)=>p.forEach((n,j)=>assert.ok(Math.abs(n-b[i][j])<1e-8)));}
});
