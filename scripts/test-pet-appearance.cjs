const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript'),path=require('path');
const source=file=>fs.readFileSync(path.join(__dirname,'../constants',file),'utf8');
const run=(file,requireFn=()=>{})=>{const exports={};vm.runInNewContext(ts.transpileModule(source(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports,require:requireFn});return exports;};
const looks=run('petAppearance.ts');
const plain=value=>JSON.parse(JSON.stringify(value));
test('old or malformed appearance data falls back safely, field by field',()=>{
 for(const input of [null,{},'cat',{species:'dragon',color:'__proto__',hat:'bad',face:42,neck:false}])assert.deepEqual(plain(looks.sanitizePetAppearance(input)),plain(looks.DEFAULT_PET_APPEARANCE));
 assert.deepEqual(plain(looks.sanitizePetAppearance({species:'bunny',color:'rose',hat:'crown',face:'glasses',neck:'medal',extra:'ignored'})),{species:'bunny',color:'rose',hat:'crown',face:'glasses',neck:'medal'});
});
test('every catalog combination survives validation; random looks always use valid choices',()=>{
 for(const species of looks.PET_SPECIES)for(const color of Object.keys(looks.PET_PALETTES))for(const hat of looks.PET_HATS)for(const face of looks.PET_FACE)for(const neck of looks.PET_NECK){
  const appearance={species,color,hat,face,neck};assert.deepEqual(plain(looks.sanitizePetAppearance(appearance)),appearance);
 }
 for(const n of [0,.5,.999,1,-1,NaN,Infinity]){
  const randomized=looks.randomPetAppearance(()=>n);assert.deepEqual(plain(looks.sanitizePetAppearance(randomized)),plain(randomized));
 }
});
test('appearance saving migrates legacy names, renaming preserves outfit, and accounts stay separate',async()=>{
 const data=new Map([['@footprint_nutrition_pet_a',JSON.stringify({version:1,name:'Mochi'})]]);
 let fail=false;const store={getItem:async key=>data.get(key)||null,setItem:async(key,value)=>{if(fail)throw Error('Storage unavailable');data.set(key,value)}};
 const profile=run('nutritionPetProfile.ts',name=>name==='./petAppearance'?looks:store);
 const legacy=await profile.loadNutritionPetProfile('a');assert.equal(legacy.name,'Mochi');assert.equal(legacy.appearance.species,'cat');
 const appearance={species:'fox',color:'peach',hat:'cap',face:'shades',neck:'medal'};
 await profile.saveNutritionPetProfile('a',{appearance});assert.equal((await profile.loadNutritionPetProfile('a')).name,'Mochi');
 await profile.saveNutritionPetProfile('a',{name:'  Pip Jr  '});
 const saved=await profile.loadNutritionPetProfile('a');assert.equal(saved.name,'Pip Jr');assert.deepEqual(plain(saved.appearance),appearance);
 assert.equal((await profile.loadNutritionPetProfile('b')).name,'Pip');assert.equal((await profile.loadNutritionPetProfile('b')).appearance.hat,'none');
 fail=true;await assert.rejects(()=>profile.saveNutritionPetProfile('a',{appearance:looks.DEFAULT_PET_APPEARANCE}),/Storage unavailable/);
 assert.deepEqual(plain((await profile.loadNutritionPetProfile('a')).appearance),appearance);
});
