const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const output = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('constants/petHeadRub.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: output });
const create = output.createHeadRubTracker;
test('a back-and-forth head rub triggers happiness after two real direction changes', () => {
  const rub=create();
  assert.deepEqual([0,20,40,20,0,20].map(x=>rub.move(x)), [false,false,false,false,false,true]);
});
test('taps, finger jitters and a one-way swipe do not count as rubbing', () => {
  for (const points of [[0],[0,3,-3,5,-5,2],[0,20,40,60,80],[0,-20,-40,-60]]) {
    const rub=create(); assert.ok(points.every(x=>!rub.move(x)));
  }
});
test('release or cancellation resets the rub; separate swipes cannot combine', () => {
  const rub=create();rub.move(20);rub.move(0);rub.reset();
  assert.equal(rub.move(20),false);assert.equal(rub.move(0),false);assert.equal(rub.move(20),true);
});
test('left-first rubs work and sensitivity scales for a smaller pet', () => {
  const rub=create(7);
  assert.equal(rub.move(-8),false);assert.equal(rub.move(0),false);assert.equal(rub.move(-8),true);
});
test('invalid movement and noise near an extremum cannot invent reversals', () => {
  const rub=create();
  for (const x of [NaN,Infinity,20,24,22,25,23,21]) assert.equal(rub.move(x),false);
  assert.equal(rub.move(0),false);assert.equal(rub.move(20),true);
});
