const fs=require('fs'),vm=require('vm'),path=require('path'),{createRequire}=require('module');
const repo=path.resolve(__dirname,'..'),req=createRequire(repo+'/package.json'),ts=req('typescript'),assert=require('node:assert/strict');
const staged=path.join(__dirname,'nutritionPet.ts');
const exports_={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(fs.existsSync(staged)?staged:path.join(repo,'constants/nutritionPet.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exports_,Date});
const day='2026-11-20',date=(hour,minute=0,d=day)=>new Date(`${d}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`);
const meal=(id,cals,hour,minute=0,d=day)=>({id,calories:cals,dateKey:d,timestamp:date(hour,minute,d).getTime()});
const compute=(hour,meals=[],goal='bulk',minute=0,d=day)=>exports_.computeNutritionPet(meals,2000,goal,d,date(hour,minute,d));
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
test('empty diary starts happy, gently checks in, becomes hungry then subdued as time passes',()=>{
  for(const [h,mood,expression] of [[7,'cheerful','happy'],[9,'cheerful','happy'],[11,'curious','ready'],[13,'hungry','hungry'],[15,'low','hungry']]){
    const s=compute(h);assert.equal(s.mood,mood,h);assert.equal(exports_.nutritionPetExpression(s),expression,h);
  }
});
test('both a logging gap and daytime shortfall are needed: no sadness for being below a whole-day target at breakfast',()=>{
  const logs=[meal('a',400,8)];assert.equal(compute(9,logs).mood,'cheerful');assert.equal(compute(11,logs).mood,'energized');
  assert.equal(compute(14,logs).mood,'hungry');assert.equal(compute(18,logs).mood,'low');
});
test('a real recent positive meal restores mood for 45 minutes; it is not a permanent override',()=>{
  const logs=[meal('a',200,17)];assert.equal(compute(17,logs).mood,'recovering');assert.equal(compute(17,logs,'bulk',45).mood,'recovering');
  assert.notEqual(compute(18,logs).mood,'recovering');assert.equal(compute(22,logs).mood,'hungry');
});
test('reaching the target outranks even a long logging gap, for every plan',()=>{
  for(const goal of ['cut','bulk','maintain']){
    assert.equal(compute(22,[meal('a',1800,8)],goal).mood,'satisfied');
    assert.equal(compute(22,[meal('a',2200,8)],goal).mood,'satisfied');
  }
});
test('fullness outranks recent meal cheer; logging remains allowed and copy avoids compensation',()=>{
  const s=compute(18,[meal('a',2400,18)],'cut');assert.equal(s.mood,'full');assert.equal(s.rhythm.expression,'full');assert.match(s.dialogue,/no need to make up/);
  assert.equal(compute(18,[meal('a',2800,18)]).mood,'stuffed');
});
test('night is restful, with no hunger reminders even after an empty day',()=>{
  for(const hour of [0,4,6,23]){const s=compute(hour);assert.equal(s.mood,'sleepy');assert.equal(s.rhythm.expression,'ready');
    for(let n=0;n<3;n++)assert.doesNotMatch(exports_.nutritionPetDialogue(s,n),/hungry|missing|rumble/i);
  }
});
test('local midnight resets daily mood and calories without losing care level',()=>{
  const logs=[meal('a',2000,12)];const s=compute(8,logs,'bulk',0,'2026-11-21');assert.equal(s.calories,0);assert.equal(s.mood,'cheerful');assert.equal(s.loggedDays,1);assert.equal(s.streak,1);
});
test('zero, invalid, future and mismatched timestamps cannot buy a recent-log mood boost',()=>{
  const zero=compute(17,[meal('zero',0,17)]);assert.equal(zero.mood,'low');
  for(const timestamp of [NaN,Infinity,date(18).getTime(),date(17,0,'2026-11-19').getTime()]){
    const s=compute(17,[{...meal('a',100,17),timestamp}]);assert.equal(s.rhythm.minutesSinceLog,null);assert.notEqual(s.mood,'recovering');
  }
});
test('legacy untimed logs never fabricate timing; duplicate IDs never refresh a timestamp',()=>{
  const s=compute(17,[{id:'a',dateKey:day,calories:100}]);assert.equal(s.rhythm.lastLogLabel,'Meal time unavailable');
  const dup=compute(17,[meal('a',100,8),meal('a',100,17)]);assert.equal(dup.calories,100);assert.equal(dup.mood,'low');assert.equal(dup.rhythm.minutesSinceLog,540);
});
test('deletion and correction recompute timing, fullness and mood without stored mood state',()=>{
  const older=meal('a',100,8),recent=meal('b',500,17);assert.equal(compute(17,[older,recent]).mood,'recovering');assert.equal(compute(17,[older]).mood,'low');
  assert.equal(compute(17,[{...recent,calories:2000}]).mood,'satisfied');
});
test('head rub cheers a sad or full pet temporarily without editing calories, timing, or care',()=>{
  for(const s of [compute(17),compute(17,[meal('a',2500,17)])]){
    const before=JSON.stringify(s);assert.equal(exports_.nutritionPetExpression(s,true),'happy');assert.equal(JSON.stringify(s),before);assert.notEqual(exports_.nutritionPetExpression(s),'happy');
  }
});
test('cut and bulk have different dialogue, but share one saved target and identical care rewards',()=>{
  const cut=compute(17,[],'cut'),bulk=compute(17,[],'bulk');assert.notEqual(cut.dialogue,bulk.dialogue);
  assert.match(bulk.dialogue,/bulk/);assert.equal(cut.target,bulk.target);assert.equal(cut.level,bulk.level);
  const reached=compute(17,[meal('a',2000,8)],'cut');assert.match(reached.dialogue,/Still log/);
});
test('dialogue rotates consistently without changing the mood and handles invalid variation',()=>{
  for(const hour of [8,11,13,17,23]){
    const s=compute(hour),snapshot=JSON.stringify(s);assert.equal(new Set([0,1,2].map(i=>exports_.nutritionPetDialogue(s,i))).size,3);
    for(const i of [-9,NaN,Infinity])assert.equal(typeof exports_.nutritionPetDialogue(s,i),'string');assert.equal(JSON.stringify(s),snapshot);
  }
});
test('time curve is continuous at each daytime anchor and respects local calendar including DST',()=>{
  for(const hour of [10,14,18,21]){const a=compute(hour-1,[],'bulk',59),b=compute(hour);assert.ok(Math.abs(a.rhythm.expectedPercent-b.rhythm.expectedPercent)<1);}
  for(const d of ['2026-11-01','2027-03-14']){const s=compute(9,[],'bulk',0,d);assert.equal(s.mood,'cheerful');assert.equal(s.rhythm.period,'Morning');}
});
test('invalid targets and historical views never produce imaginary hunger timing',()=>{
  const noTarget=exports_.computeNutritionPet([],0,'cut',day,date(17));assert.equal(noTarget.rhythm,undefined);assert.equal(noTarget.mood,'ready');
  const historical=exports_.computeNutritionPet([],2000,'cut','2026-11-19',date(17));assert.equal(historical.rhythm,undefined);
  assert.equal(exports_.computeNutritionPet([],2000,'cut',day,new Date(NaN)).rhythm,undefined);
});
console.log(`${count} daily rhythm regression groups passed`);
