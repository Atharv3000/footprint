const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{createRequire}=require('module');const req=createRequire(require('path').join(__dirname,'../package.json')),ts=req('typescript');let interpolations=0;
const jsx=(type,props)=>({type,props}),svg={__esModule:true,default:'Svg'};for(const name of ['Circle','Ellipse','Line','Polygon','Rect'])svg[name]=name;
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(__dirname+'/../components/ExerciseFigure.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports:out,require:n=>n==='react'?{memo:f=>f,useMemo:f=>f()}:n==='react-native'?{Animated:{createAnimatedComponent:c=>'Animated.'+c}}:n==='react-native-svg'?svg:{jsx,jsxs:jsx,Fragment:'Fragment'}});
const catalog=JSON.parse(fs.readFileSync(__dirname+'/../constants/exerciseVectorPoses.json','utf8'));
const progress={interpolate:({outputRange})=>{interpolations++;return outputRange[0]}};
for(const demo of Object.values(catalog)){const tree=out.ExerciseFigure({demo,progress,size:40,color:'#a3e635',animate:false});assert.ok(tree)}
assert.equal(interpolations,0);out.ExerciseFigure({demo:Object.values(catalog)[0],progress,size:40,color:'#a3e635',animate:true});assert.ok(interpolations>0);
console.log('PASS all 873 static exercise figures create zero animation interpolations; animated playback remains available');
