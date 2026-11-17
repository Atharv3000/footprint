const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const output = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('constants/nutritionPet.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: output });
const compute = output.computeNutritionPet;
const today = '2026-11-14';
const meal = (id, calories, dateKey=today) => ({id,calories,dateKey});
test('fullness follows exact target boundaries without modifying a cut or bulk target', () => {
  for (const goal of ['cut','maintain','bulk']) {
    for (const [cal,mood] of [[0,'ready'],[1,'hungry'],[699,'hungry'],[700,'peckish'],[1399,'peckish'],[1400,'energized'],[1799,'energized'],[1800,'satisfied'],[2200,'satisfied'],[2201,'full'],[2600,'full'],[2601,'stuffed']]) {
      const pet = compute([meal('a',cal)],2000,goal,today);
      assert.equal(pet.mood,mood,`${goal}: ${cal}`); assert.equal(pet.target,2000);
    }
  }
});
test('plan-specific dialogue changes while fullness stays relative to the saved target', () => {
  const cut=compute([meal('a',1000)],2000,'cut',today), bulk=compute([meal('a',1000)],2000,'bulk',today);
  assert.match(cut.dialogue,/cut/); assert.match(bulk.dialogue,/bulk/); assert.equal(cut.percent,bulk.percent);
});
test('duplicates, future dates, impossible dates and invalid calorie values cannot inflate progress', () => {
  const pet=compute([meal('a',500),meal('a',500),meal('b',100,'2026-11-15'),meal('c',100,'2026-02-30'),meal('d',NaN),meal('e',-1),meal('f',Infinity),meal('',100),null,meal('g',0)],2000,'maintain',today);
  assert.equal(pet.calories,500); assert.equal(pet.loggedDays,1); assert.equal(pet.todayMealIds.length,2);
});
test('viewing historical logs does not feed today; daily rollover preserves care but resets fullness', () => {
  const logs=[meal('a',2000,'2026-11-13')];
  const pet=compute(logs,2000,'maintain',today);
  assert.equal(pet.calories,0); assert.equal(pet.mood,'ready'); assert.equal(pet.loggedDays,1); assert.equal(pet.streak,1);
  assert.equal(compute(logs,2000,'maintain','2026-11-15').streak,0);
});
test('care levels count unique logging days, never calorie amount or meal spam', () => {
  const logs=[meal('a',1),meal('b',1),meal('c',10000,'2026-11-13'),meal('d',1,'2026-11-12')];
  const pet=compute(logs,2000,'cut',today);
  assert.equal(pet.loggedDays,3); assert.equal(pet.level,2); assert.equal(pet.careProgress,0); assert.equal(pet.daysToNextLevel,3); assert.equal(pet.streak,3);
  assert.equal(compute([meal('a',0)],2000,'cut',today).loggedDays,0);
});
test('deleting and correcting diary entries recomputes fullness and care', () => {
  assert.equal(compute([meal('a',3000)],2000,'bulk',today).mood,'stuffed');
  assert.equal(compute([meal('a',2000)],2000,'bulk',today).mood,'satisfied');
  const empty=compute([],2000,'bulk',today); assert.equal(empty.calories,0); assert.equal(empty.loggedDays,0);
});
test('missing or invalid targets stay finite and request plan setup', () => {
  for (const target of [0,-1,NaN,Infinity]) {
    const pet=compute([meal('a',100)],target,'cut',today);
    assert.equal(pet.target,0); assert.equal(pet.percent,0); assert.equal(pet.mood,'ready'); assert.match(pet.dialogue,/Set a daily calorie target/);
  }
  assert.equal(compute([meal('a',100)],2000,'cut','invalid').calories,0);
});
test('streak traverses calendar days across month, year and daylight-saving boundaries', () => {
  for (const [end,dates] of [['2026-11-02',['2026-10-31','2026-11-01','2026-11-02']],['2027-01-01',['2026-12-30','2026-12-31','2027-01-01']]]) {
    assert.equal(compute(dates.map((d,i)=>meal(String(i),100,d)),2000,'maintain',end).streak,3);
  }
});

test('bulk hunger dialogue rotates, follows logged calories, and leaves rewards unchanged', () => {
  const empty=compute([],2500,'bulk',today);
  const lines=[0,1,2].map(i=>output.nutritionPetDialogue(empty,i));
  assert.equal(new Set(lines).size,3);
  assert.match(lines[0],/hungry/);
  assert.ok(lines.every(line=>/bulk/i.test(line)));
  assert.equal(empty.loggedDays,0);assert.equal(empty.target,2500);
  const fueled=compute([meal('a',2300)],2500,'bulk',today);
  assert.doesNotMatch(output.nutritionPetDialogue(fueled,0),/hungry/);
});
test('cut banter begins at the target, never prematurely, and keeps logging available', () => {
  const below=compute([meal('a',1900)],2000,'cut',today);
  assert.doesNotMatch(output.nutritionPetDialogue(below,1),/paws are off duty/);
  for(const calories of [2000,2600]) {
    const reached=compute([meal('a',calories)],2000,'cut',today);
    assert.match(output.nutritionPetDialogue(reached,0),/cut target/);
    assert.match(output.nutritionPetDialogue(reached,1),/Keep logging/);
    assert.match(output.nutritionPetDialogue(reached,2),/head rubs/);
    assert.equal(reached.calories,calories);
  }
});
test('missing targets request setup; dialogue handles changing goals and invalid variation safely', () => {
  const missing=compute([],0,'cut',today);
  assert.equal(output.nutritionPetDialogue(missing,2),missing.dialogue);
  const cut=compute([meal('a',2000)],2000,'cut',today);
  const bulk=compute([meal('a',2000)],3000,'bulk',today);
  assert.notEqual(output.nutritionPetDialogue(cut),output.nutritionPetDialogue(bulk));
  for(const index of [-10,NaN,Infinity]) assert.equal(typeof output.nutritionPetDialogue(cut,index),'string');
});

test('expressions show hunger or overfull sadness outside the target range; head rubs cheer them temporarily', () => {
  for(const goal of ['cut','bulk','maintain']) {
    for(const [calories,expression] of [[0,'hungry'],[1000,'hungry'],[1799,'hungry'],[1800,'happy'],[2000,'happy'],[2200,'happy'],[2201,'full'],[3000,'full']]) {
      const state=compute([meal('a',calories)],2000,goal,today);
      assert.equal(output.nutritionPetExpression(state),expression);
      assert.equal(output.nutritionPetExpression(state,true),'happy');
      assert.equal(output.nutritionPetExpression(state),expression);
    }
  }
  assert.equal(output.nutritionPetExpression(compute([],0,'bulk',today)),'ready');
  assert.equal(output.nutritionPetExpression({target:2000,percent:NaN}),'ready');
});
