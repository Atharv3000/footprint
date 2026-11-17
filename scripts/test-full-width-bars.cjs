const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exp={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('constants/fullWidthLayout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exp});
const offset=exp.fullWidthBarOffset;
test('tracks inside ordinary, nested and bordered cards reach both screen edges',()=>{
 for(const gutter of [0,16,17,32,48,50]){const width=390-2*gutter,left=offset(0,390,gutter,width);assert.equal(gutter-left,0);assert.equal(gutter-left+390,390);}
});
test('presented sheets and desktop phone frames use their own origin and width',()=>{
 for(const [origin,width,gutter] of [[120,600,32],[350,390,16],[20,320,22]]){const x=origin+gutter,left=offset(origin,width,x,width-2*gutter);assert.equal(x-left,origin);assert.equal(x-left+width,origin+width);}
});
test('rotation recomputes the track offset rather than preserving portrait width',()=>{
 assert.equal(offset(0,390,16,358),16);assert.equal(offset(0,844,24,796),24);
});
test('offscreen onboarding pages keep the same gutter when they scroll into view',()=>{
 for(const page of [-1,0,1,2,3])assert.equal(offset(0,390,page*390+24,342),24);
});
test('zero or invalid layout measurements remain safe until layout is available',()=>{
 for(const args of [[0,0,16,200],[0,390,16,0],[0,NaN,16,200],[0,390,Infinity,200]])assert.equal(offset(...args),0);
 assert.equal(offset(0,390,0,500),0);
});
