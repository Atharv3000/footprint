const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../constants/cameraFraming.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const api = {};
vm.runInNewContext(code, { exports: api });

test('alternating portrait and landscape capture responses cannot resize the native preview', () => {
  const view = { width: 390, height: 844 };
  const native = api.previewFrame(view, .75, true);
  const bounds = JSON.stringify(native);
  for (const returnedAspect of [.75, 4/3, .75, 4/3, undefined, .75]) {
    const projection = api.landmarkFrame(native, returnedAspect);
    assert.equal(JSON.stringify(native), bounds);
    assert.equal(native.width, 390); assert.equal(native.height, 520);
    assert.ok(projection.width <= native.width && projection.height <= native.height);
    assert.equal(projection.left + projection.width / 2, view.width / 2);
    assert.equal(projection.top + projection.height / 2, view.height / 2);
  }
});

test('full-screen mode covers the view while full-frame mode preserves the whole camera field', () => {
  const view = { width: 390, height: 844 };
  const cover = api.previewFrame(view, .75, false);
  const fit = api.previewFrame(view, .75, true);
  assert.equal(cover.height, 844); assert.ok(cover.width > view.width);
  assert.equal(fit.width, 390); assert.ok(fit.height < view.height);
});

test('matching capture coordinates project to the same preview bounds', () => {
  const native = api.previewFrame({ width: 390, height: 844 }, .75, true);
  assert.equal(JSON.stringify(api.landmarkFrame(native, .75)), JSON.stringify(native));
  assert.equal(JSON.stringify(api.landmarkFrame(native, NaN)), JSON.stringify(native));
});
