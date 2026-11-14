const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const SafeContext = React.createContext({top: 0, right: 0, bottom: 0, left: 0, width: 600, height: 600});
const localMetrics = {top: 62, right: 0, bottom: 34, left: 0, width: 402, height: 874};
const flatten = value => Object.assign({}, ...(Array.isArray(value) ? value.flat(Infinity).filter(Boolean) : [value || {}]));
const View = ({children, style}) => React.createElement('div', {'data-max-height': flatten(style).maxHeight}, children);
const native = {
 Modal: ({children}) => React.createElement('main', {}, children), View, TouchableOpacity: View,
 StyleSheet: {create: value => value, flatten, absoluteFill: {}},
 Platform: {OS: 'ios'}, Dimensions: {get: () => ({width: 600, height: 600})},
 Animated: {Value: class {constructor(value){this.value=value;}}, View},
 PanResponder: {create: () => ({panHandlers: {}})},
};
const safeArea = {
 SafeAreaProvider: ({children}) => React.createElement(SafeContext.Provider, {value: localMetrics}, children),
 SafeAreaView: ({children}) => React.createElement('section', {'data-safe-area': 'true'}, children),
 useSafeAreaInsets: () => React.useContext(SafeContext),
 useSafeAreaFrame: () => React.useContext(SafeContext),
};
const modules = new Map();
function load(file) {
 if(modules.has(file))return modules.get(file);
 const exports={}; modules.set(file,exports);
 const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(compiled,{exports,require:name=>{
  if(name==='react'||name==='react/jsx-runtime')return require(name);
  if(name==='react-native')return native;
  if(name==='react-native-safe-area-context')return safeArea;
  if(name==='@/constants/ThemeContext')return {useTheme:()=>({colors:{background:'#09090b'}})};
  if(name==='@/components/AppModal')return load('components/AppModal.tsx');
  if(name==='@/constants/useScreenInsets')return load('constants/useScreenInsets.ts');
  if(name==='@/constants/safeAreaLayout')return load('constants/safeAreaLayout.ts');
  throw Error(name);
 }});
 return exports;
}
const {AppModal}=load('components/AppModal.tsx');
const {InteractiveBottomModal}=load('components/InteractiveBottomModal.tsx');

test('a bottom sheet uses the presented modal frame rather than its parent page-sheet measurements',()=>{
 const html=renderToStaticMarkup(React.createElement(SafeContext.Provider,{value:{top:0,left:0,right:0,bottom:0,width:600,height:600}},
  React.createElement(InteractiveBottomModal,{visible:true,onDismiss:()=>{},cardStyle:{height:'95%',maxHeight:'95%'}},React.createElement('h1',{},'Sheet header'))));
 assert.ok(html.includes('data-max-height="800"'));
 assert.ok(!html.includes('data-max-height="588"'));
});
test('full-screen modal content receives one safe-area frame',()=>{
 const html=renderToStaticMarkup(React.createElement(AppModal,{visible:true},React.createElement(View,{},'Modal header')));
 assert.equal((html.match(/data-safe-area="true"/g)||[]).length,1);
});
test('the camera opt-out preserves its edge-to-edge content without safe-area padding',()=>{
 const html=renderToStaticMarkup(React.createElement(AppModal,{visible:true,edgeToEdge:true},React.createElement('div',{'data-camera':'full-frame'},'Camera')));
 assert.ok(html.includes('data-camera="full-frame"'));
 assert.ok(!html.includes('data-safe-area'));
});
