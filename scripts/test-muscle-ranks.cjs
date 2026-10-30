const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

function load(relative, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, Date, console, require: name => {
    if (name in mocks) return mocks[name];
    throw new Error('Unexpected dependency: ' + name);
  } });
  return exports;
}
const ranks = load('constants/muscleRanks.ts');
const now = new Date(2026, 9, 29, 18);
const log = (id, day, overrides = {}) => ({ id, userId: 'alice', date: new Date(2026, 9, day, 12).toISOString(),
  exerciseId: 'bicep_curls', exerciseName: 'Bicep Curls', reps: 10, weight: 15, weightUnit: 'kg', ...overrides });
const part = (logs, group = 'arms', exercises = []) => ranks.computeMuscleRanks(logs, exercises, 'alice', now).find(rank => rank.part === group);

test('empty history starts every body part at Iron', () => {
  const all = ranks.computeMuscleRanks([], [], 'alice', now);
  assert.equal(all.length, 6); assert.ok(all.every(rank => rank.tier.id === 'iron' && rank.days === 0));
});
test('three arm-training days unlock Silver', () => {
  const result = part([log('a', 20), log('b', 22), log('c', 24)]);
  assert.equal(result.days, 3); assert.equal(result.tier.id, 'silver');
  assert.equal(result.next.id, 'gold'); assert.equal(result.remaining, 4);
});
test('many sets and different arm exercises on one day count once', () => {
  const result = part([log('a', 20), log('b', 20), log('c', 20, { exerciseId: 'hammer_curls' })]);
  assert.equal(result.days, 1); assert.equal(result.tier.id, 'bronze');
});
test('local calendar days, rather than 24-hour spacing, determine credit', () => {
  const result = part([log('a', 20, { date: new Date(2026, 9, 20, 23, 50).toISOString() }),
    log('b', 21, { date: new Date(2026, 9, 21, 0, 10).toISOString() })]);
  assert.equal(result.days, 2);
});
test('duplicate log IDs cannot award extra days', () => {
  assert.equal(part([log('same', 20), log('same', 21), log('same', 22)]).days, 1);
});
test('primary muscles map compounds to each target body part without secondary inflation', () => {
  const exercises = [{ id: 'compound', name: 'Compound', category: 'back', primaryMuscles: ['chest', 'triceps'] }];
  const logs = [log('a', 20, { exerciseId: 'compound', exerciseName: 'Compound' })];
  assert.equal(part(logs, 'arms', exercises).days, 1); assert.equal(part(logs, 'chest', exercises).days, 1);
  assert.equal(part(logs, 'back', exercises).days, 0);
});
test('bodyweight and older camera push-up logs count', () => {
  assert.equal(part([log('a', 20, { exerciseId: 'pushups', exerciseName: 'Pushups', weight: 0 })], 'chest').days, 1);
});
test('demo, invalid, future and other-user logs do not earn ranks', () => {
  const invalid = [log('demo_1', 20), log('a', 20, { reps: 0 }), log('b', 20, { weight: -1 }),
    log('c', 30), log('d', 20, { userId: 'bob' }), log('e', 20, { date: 'bad' }),
    log('f', 20, { date: '2026-02-30' }), log('g', 20, { reps: NaN })];
  assert.equal(part(invalid).days, 0);
});
test('recognized names and exercise category provide fallbacks; unknown exercises do not award arbitrary credit', () => {
  const exercises = [{ id: 'new_arm', name: 'Arm Machine', category: 'arms', primaryMuscles: [] }];
  assert.equal(part([log('a', 20, { exerciseId: 'old_alias', exerciseName: 'Arm Machine' })], 'arms', exercises).days, 1);
  assert.equal(part([log('a', 20, { exerciseId: 'unknown', exerciseName: 'Unknown' })]).days, 0);
});
test('removing history recalculates the rank', () => {
  const logs = [log('a', 20), log('b', 22), log('c', 24)];
  assert.equal(part(logs).tier.id, 'silver'); assert.equal(part(logs.slice(1)).tier.id, 'bronze');
});
test('all thresholds are reachable and maximum rank has finite completed progress', () => {
  for (const tier of ranks.MUSCLE_TIERS) assert.equal(ranks.tierForDays(tier.days).id, tier.id);
  const top = ranks.rankForPart('legs', 250);
  assert.equal(top.tier.id, 'olympian'); assert.equal(top.next, null); assert.equal(top.progress, 1); assert.equal(top.remaining, 0);
});
test('rank history loader never seeds demo data or migrates another storage key', async () => {
  const reads = []; const writes = []; const events = [];
  const storage = { getItem: async key => { reads.push(key); return null; }, setItem: async (...args) => writes.push(args) };
  const api = load('constants/workoutStorage.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    'react-native': { DeviceEventEmitter: { emit: (...args) => events.push(args) } },
    './exercisesData.json': [],
  });
  assert.equal((await api.loadRankableWorkoutLogs('alice')).length, 0);
  assert.equal(reads.length, 1); assert.equal(reads[0], '@stridetrack_workout_logs_alice');
  assert.equal(writes.length, 0); assert.equal(events.length, 0);
});
test('successful save and delete notify rank views for the correct user', async () => {
  let saved = null; const events = [];
  const storage = { getItem: async () => saved, setItem: async (key, data) => { saved = data; } };
  const api = load('constants/workoutStorage.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    'react-native': { DeviceEventEmitter: { emit: (...args) => events.push(args) } },
    './exercisesData.json': [],
  });
  const result = await api.saveWorkoutLog('alice', log('ignored', 20));
  await api.deleteWorkoutLogsByIds('alice', [result.id]);
  assert.equal(events.length, 2); assert.ok(events.every(event => event[1].userId === 'alice'));
  assert.equal(JSON.parse(saved).length, 0);
});
