const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('constants/safeAreaLayout.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const { sheetMaxHeight } = exportsObject;

test('tall bottom-sheet headers remain below iPhone status bars and Dynamic Islands', () => {
  for (const device of [{ height: 667, top: 20 }, { height: 844, top: 47 }, { height: 852, top: 59 }, { height: 874, top: 62 }]) {
    for (const requested of [undefined, '95%', '100%', device.height, device.height*2]) {
      const sheetHeight = sheetMaxHeight(device.height, device.top, requested);
      const sheetTop = device.height-sheetHeight;
      assert.ok(sheetTop >= device.top+12);
      assert.ok(sheetHeight > 0);
    }
  }
});
test('short sheets retain the height requested by their screen', () => {
  assert.equal(sheetMaxHeight(852, 59, 300), 300);
  assert.equal(sheetMaxHeight(852, 59, '50%'), 426);
});
test('rotation recalculates the usable sheet height', () => {
  const portrait = sheetMaxHeight(852, 59, '95%');
  const landscape = sheetMaxHeight(393, 0, '95%');
  assert.ok(landscape < portrait);
  assert.ok(393-landscape >= 12);
});
test('tiny or invalid requested heights cannot extend above the safe boundary', () => {
  assert.equal(sheetMaxHeight(50, 59), 0);
  assert.equal(sheetMaxHeight(852, 59, -10), 0);
  assert.equal(sheetMaxHeight(852, 59, 'auto'), 781);
});
