const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{createRequire}=require('module');
const repo=require('path').resolve(__dirname,'..'),ts=createRequire(repo+'/package.json')('typescript'),motion={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(repo+'/constants/exerciseMotion.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:motion});
const jsx=(type,props)=>({type,props}),svg={__esModule:true,default:'Svg'};for(const n of ['Circle','Ellipse','Line','Path','Polygon','Rect'])svg[n]=n;
let bindings=0;const out={};
const animated={__esModule:true,default:{createAnimatedComponent:c=>'Animated.'+c},useDerivedValue:f=>({value:f()}),useAnimatedProps:f=>{bindings++;const props=f();for(const [key,value]of Object.entries(props))if(key==='d')assert.match(value,/^M [\d., -]+ L [\d., -]+ L [\d., -]+ L [\d., -]+ Z$/);else assert.ok(Number.isFinite(value),key);return props}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(repo+'/components/NativeExerciseFigure.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports:out,require:n=>n==='react'?{memo:f=>f}:n==='react-native-reanimated'?animated:n==='react-native-svg'?svg:n==='@/constants/exerciseMotion'?motion:{jsx,jsxs:jsx,Fragment:'Fragment'}});
function walk(n){if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;if(typeof n.type==='function')walk(n.type(n.props));else walk(n.props?.children)}
const catalog=JSON.parse(fs.readFileSync(repo+'/constants/exerciseVectorPoses.json','utf8'));
for(const demo of Object.values(catalog))for(const value of [0,.5,1])walk(out.NativeExerciseFigure({demo,progress:{value},size:44,color:'#a3e635'}));
assert.ok(bindings>50000);
console.log(`PASS every native SVG artwork renders finite animated props at start, middle and end (${bindings} bindings checked)`);
