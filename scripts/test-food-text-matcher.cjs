const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const load = (file, deps = {}) => {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(js, { exports, require: (m) => deps[m] });
  return exports;
};
const db = load('constants/foodDatabase.ts');
const m = load('constants/foodTextMatcher.ts', { './foodDatabase': db });

test('splits descriptions and parses numeric, word and fractional quantities', () => {
  assert.equal(JSON.stringify(m.splitDescription('2 eggs, toast and a coffee; banana')), JSON.stringify(['2 eggs', 'toast', 'a coffee', 'banana']));
  assert.equal(m.parseQuantity('3 cookies').quantity, 3);
  assert.equal(m.parseQuantity('two slices of pizza').quantity, 2);
  assert.equal(m.parseQuantity('1/2 avocado').quantity, 0.5);
  assert.equal(m.parseQuantity('half a bagel').quantity, 0.5);
  assert.equal(m.parseQuantity('999 shrimp').quantity, 50);
});

test('matches common foods to the nutrition index', () => {
  const name = (q) => m.matchFood(q).item.name;
  assert.match(name('banana'), /Banana/);
  assert.match(name('grilled chicken'), /Chicken Breast/);
  assert.match(name('salmon'), /Salmon/);
  assert.match(name('greek yogurt'), /Greek Yogurt/);
  assert.match(name('lemonade'), /Lemonade/);
  assert.match(name('pepperoni pizza'), /Pizza/);
  assert.equal(m.matchFood('of the'), null);
});

test('scales by quantity and treats piece counts inside multi-piece portions', () => {
  const [banana] = m.estimateDescription('2 bananas');
  assert.equal(banana.calories, 210); assert.ok(banana.matchedId);
  const [oreo] = m.estimateDescription('3 oreos');  // index portion is already 3 cookies
  const oreoItem = db.HUGE_FOOD_INDEX.find((i) => i.id === 's9');
  assert.equal(oreo.calories, oreoItem.calories);
  const [pizza] = m.estimateDescription('2 slices of pepperoni pizza');
  assert.equal(pizza.calories, 580);
});

test('unknown foods fall back to low-confidence generic estimates', () => {
  const [x] = m.estimateDescription('a mystery casserole');
  assert.equal(x.matchedId, null); assert.ok(x.confidence <= 0.35); assert.ok(x.calories > 0);
  const [cake] = m.estimateDescription('slice of birthday cake');
  assert.equal(cake.matchedId, null); assert.equal(cake.calories, 160);
});
