const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('constants/boxingPadPresentation.ts', 'utf8');
const exported = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: exported });
const { boxingPadPresentation: pose, boxingPadArrival: arrival } = exported;

test('straights retain a forward-facing contact surface', () => {
  for (const side of [-1, 1]) {
    const p = pose('straight', side);
    assert.ok(p.normal.z > .97);
    assert.ok(Math.abs(p.matrix[0]) > .98);
  }
});
test('hooks yaw into the requested punch, with a narrow face and visible thickness', () => {
  for (const side of [-1, 1]) {
    const p = pose('hook', side);
    assert.ok(p.normal.x * side < -.9);
    assert.ok(Math.abs(p.matrix[0]) < .4);
    assert.ok(Math.abs(p.matrix[3]) > .98);
    assert.ok(Math.abs(p.normal.x * p.thickness) > 15);
  }
});
test('uppercuts present a downward-facing surface, foreshortened vertically', () => {
  for (const side of [-1, 1]) {
    const p = pose('uppercut', side);
    assert.ok(p.normal.y > .85);
    assert.ok(Math.abs(p.matrix[3]) < .5);
    assert.ok(Math.abs(p.matrix[0]) > .98);
  }
});
test('all views project a finite, visible face rather than rotating a flat bitmap', () => {
  for (const kind of ['straight', 'hook', 'uppercut']) for (const side of [-1, 1]) {
    const p = pose(kind, side);
    assert.ok(p.matrix.every(Number.isFinite));
    const area = p.matrix[0]*p.matrix[3]-p.matrix[1]*p.matrix[2];
    assert.ok(area > .3 && area <= 1);
    assert.ok(Math.abs(area-p.normal.z) < 1e-9);
  }
});
test('presentation motion settles at the unchanged scoring location before HIT NOW', () => {
  for (const side of [-1, 1]) {
    assert.ok(arrival('hook', side, 0, 50).x * side < 0);
    assert.ok(arrival('uppercut', side, 0, 50).y < 0);
    for (const kind of ['straight', 'hook', 'uppercut']) for (const age of [1.9, 3, 3.8]) {
      const position = arrival(kind, side, age, 50);
      assert.equal(Math.abs(position.x), 0); assert.equal(Math.abs(position.y), 0);
    }
  }
});
