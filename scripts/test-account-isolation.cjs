const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('node:assert/strict'), { createRequire } = require('module');
const crypto = require('crypto');
const repo = path.resolve(__dirname, '..'), req = createRequire(repo + '/package.json'), ts = req('typescript');

function harness(seed = {}, initialSessionUser = null) {
  const data = new Map(Object.entries(seed)), cache = {}, writes = [];
  const store = {
    getItem: async k => data.get(k) ?? null,
    setItem: async (k, v) => { data.set(k, v); writes.push(k); },
    removeItem: async k => { data.delete(k); },
    getAllKeys: async () => [...data.keys()]
  };

  // In-memory Supabase Auth server simulation (salted scrypt hashing on server side only)
  const serverUsers = new Map();
  let activeSession = initialSessionUser ? { user: initialSessionUser, access_token: 'jwt-' + initialSessionUser.id } : null;
  const authListeners = new Set();

  const supabaseAuthMock = {
    supabase: {
      auth: {
        async getSession() { return { data: { session: activeSession }, error: null }; },
        onAuthStateChange(cb) {
          authListeners.add(cb);
          return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
        },
        async signUp({ email, password, options }) {
          const clean = email.trim().toLowerCase();
          if (serverUsers.has(clean)) return { data: { user: null, session: null }, error: { message: 'User already registered' } };
          const salt = crypto.randomBytes(16).toString('hex');
          const derived = crypto.scryptSync(password, salt, 32).toString('hex');
          const sbUser = {
            id: 'uid-' + crypto.createHash('sha256').update(clean).digest('hex').slice(0, 12),
            email: clean,
            app_metadata: { provider: 'email' },
            user_metadata: { full_name: options?.data?.full_name || '' }
          };
          serverUsers.set(clean, { sbUser, salt, derived });
          activeSession = { user: sbUser, access_token: 'jwt-' + sbUser.id };
          return { data: { user: sbUser, session: activeSession }, error: null };
        },
        async signInWithPassword({ email, password }) {
          const clean = email.trim().toLowerCase();
          const rec = serverUsers.get(clean);
          if (!rec) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
          const derived = crypto.scryptSync(password, rec.salt, 32).toString('hex');
          if (!crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(rec.derived, 'hex'))) {
            return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
          }
          activeSession = { user: rec.sbUser, access_token: 'jwt-' + rec.sbUser.id };
          return { data: { user: rec.sbUser, session: activeSession }, error: null };
        },
        async signOut() {
          activeSession = null;
          return { error: null };
        },
      }
    },
    isSupabaseConfigured: true
  };

  let hook = 0, values = [], effects = [], refs = [];
  const hooks = {
    createContext: () => ({ Provider: 'provider' }),
    useContext: () => null,
    useRef: initial => { const i = hook++; if (!(i in refs)) refs[i] = { current: initial }; return refs[i]; },
    useState: initial => { const i = hook++; if (!(i in values)) values[i] = initial; return [values[i], v => { values[i] = typeof v === 'function' ? v(values[i]) : v; }]; },
    useEffect: fn => { if (!cache.mounted) effects.push(fn); },
    useCallback: fn => fn
  };
  const mocks = {
    'react': { ...hooks, default: hooks },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': { Platform: { OS: 'web' }, Alert: { alert() { } }, DeviceEventEmitter: { emit() { } } },
    '@react-native-async-storage/async-storage': store,
    'expo-web-browser': { maybeCompleteAuthSession() { } },
    'expo-auth-session': { makeRedirectUri: () => '', useAuthRequest: () => [null, null, null], ResponseType: { IdToken: 'id_token' } },
    'expo-apple-authentication': { isAvailableAsync: async () => false },
    'expo-secure-store': store,
    'expo-crypto': {
      CryptoDigestAlgorithm: { SHA256: 'sha256' },
      getRandomBytesAsync: async n => new Uint8Array(crypto.randomBytes(n)),
      digestStringAsync: async (_, p) => crypto.createHash('sha256').update(p).digest('hex')
    }
  };
  function load(rel) {
    rel = rel.replaceAll('\\', '/');
    if (cache[rel]) return cache[rel];
    const out = {}; cache[rel] = out;
    const file = path.join(repo, rel);
    if (rel.endsWith('.json')) return cache[rel] = JSON.parse(fs.readFileSync(file, 'utf8'));
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInNewContext(code, {
      exports: out, console, Date, Map, Set, Promise, setTimeout, process: { env: {} },
      require: n => {
        if (mocks[n]) return mocks[n];
        if (n === './supabaseClient') return supabaseAuthMock;
        if (n === './demoPreload') return { DEMO_ACCOUNT: { name: 'Demo', email: 'alex.mercer@stridetrack.app' }, preloadDemoAccountData: async () => { } };
        if (n.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(rel), n)) + (/\.json$/.test(n) ? '' : '.ts'));
        return req(n);
      }
    }, { filename: rel });
    return out;
  }
  const auth = () => { hook = 0; return load('constants/AuthContext.tsx').AuthProvider({ children: null }).props.value; };
  return {
    load, data, writes, auth,
    async mount() { auth(); cache.mounted = true; for (const effect of effects) effect(); effects = []; await new Promise(r => setTimeout(r, 25)); return auth(); }
  };
}

let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('PASS ' + name); }

(async () => {
  await test('New account has no fabricated history, routines, photos or badges', async () => {
    const h = harness(), w = h.load('constants/workoutStorage.ts');
    for (const fn of ['loadWorkoutLogs', 'loadProgressPhotos', 'loadWeightLogs', 'loadBodyFatLogs', 'loadCustomRoutines']) {
      assert.equal((await w[fn]('new')).length, 0);
    }
    assert.equal((await h.load('constants/walkStorage.ts').loadWalks('new')).length, 0);
    await h.load('constants/stepsStorage.ts').ensureMockDataSeeded('new');
    const b = h.load('constants/badgesEngine.ts'), stats = await b.getUserBadgeStats('new');
    assert.equal(stats.totalSteps, 0); assert.equal(stats.totalWalks, 0); assert.equal(stats.consecutiveStreakDays, 0);
    assert.ok(b.computeBadges(stats).every(b => b.currentTier === null));
    assert.ok(!h.writes.some(k => k.includes('steps_seeded')));
  });

  await test('Known samples and foreign-owner entries hidden; genuine records retained', async () => {
    const id = 'a', h = harness({
      '@stridetrack_workout_logs_a': JSON.stringify([{ id: 'demo_1', userId: id }, { id: 'real', userId: id }, { id: 'foreign', userId: 'b' }]),
      '@footprint_walks_a': JSON.stringify([{ id: 'walk_demo_1', userId: id }, { id: 'walk_123', userId: id }])
    });
    const raw = h.load('constants/accountRecords.ts');
    assert.equal(raw.cleanAccountRecords(id, 'workouts', [{ id: 'demo_1', userId: id }, { id: 'real', userId: id }, { id: 'foreign', userId: 'b' }]).map(r => r.id).join(','), 'real');
    assert.equal((await h.load('constants/workoutStorage.ts').loadWorkoutLogs(id)).map(r => r.id).join(','), 'real');
    assert.equal((await h.load('constants/walkStorage.ts').loadWalks(id)).map(r => r.id).join(','), 'walk_123');
  });

  await test('Seeded steps archived and rebuilt from genuine walks only', async () => {
    const original = JSON.stringify({ '2026-11-17': { totalSteps: 99999 } });
    const h = harness({
      '@stridetrack_steps_seeded_a': '1',
      '@stridetrack_steps_a': original,
      '@footprint_walks_a': JSON.stringify([{ id: 'walk_demo_1', userId: 'a', steps: 9000, date: '2026-11-17T12:00:00Z' }, { id: 'walk_123', userId: 'a', steps: 1234, date: '2026-11-17T12:00:00Z' }])
    });
    const steps = h.load('constants/stepsStorage.ts');
    const days = await steps.loadAllStepData('a');
    assert.equal(Object.values(days).reduce((n, d) => n + d.totalSteps, 0), 1234);
    assert.equal(h.data.get('@footprint_step_seed_repaired_v1_a_backup'), original);
    assert.equal(JSON.stringify(await steps.loadAllStepData('a')), JSON.stringify(days));
  });

  await test('Guest workouts never migrated to another account', async () => {
    const h = harness({ '@stridetrack_workout_logs_guest_user': JSON.stringify([{ id: 'real', userId: 'guest_user' }]) });
    assert.equal((await h.load('constants/workoutStorage.ts').loadWorkoutLogs('new')).length, 0);
  });

  await test('Server-verified Supabase email auth isolates accounts without client-side password storage', async () => {
    const h = harness();
    let a = await h.mount();
    await assert.rejects(a.signUpWithEmail('Alice', 'alice@example.com', 'short7'));
    await a.signUpWithEmail('Alice', ' Alice@EXAMPLE.com ', 'StrongPass123!');
    a = h.auth();
    const aliceId = a.user.id;
    assert.ok(aliceId.startsWith('uid-'));
    assert.equal(a.profile.authProvider, 'email');
    assert.equal(a.profile.weightKg, 0);
    assert.equal(a.profile.hasCompletedSetup, false);
    assert.equal((await h.load('constants/onboardingStorage.ts').loadTutorialForAccount(aliceId)).phase, 'read');
    assert.equal(h.data.get('footprint_email_accounts'), undefined);

    await a.updateProfile({ weightKg: 82, heightCm: 182, age: 31, hasCompletedSetup: true, avatarUrl: 'alice-photo' });
    a = h.auth();
    await a.signOut();
    a = h.auth();
    assert.equal(a.user, null);
    assert.equal(a.profile.weightKg, 0);

    await a.signUpWithEmail('Bob', 'bob@example.com', 'AnotherPass123!');
    a = h.auth();
    assert.equal(a.profile.weightKg, 0);
    assert.equal(a.profile.avatarUrl, undefined);
    assert.equal(a.profile.hasCompletedSetup, false);
    await a.signOut();

    a = h.auth();
    await a.signInWithEmail(' ALICE@EXAMPLE.COM ', 'StrongPass123!');
    a = h.auth();
    assert.equal(a.user.id, aliceId);
    assert.equal(a.profile.weightKg, 82);
    assert.equal(a.profile.avatarUrl, 'alice-photo');
    assert.equal(a.profile.hasCompletedSetup, true);
    assert.equal(a.user.provider, 'email');
    await assert.rejects(a.signInWithEmail('alice@example.com', 'wrong'));
    await assert.rejects(a.signUpWithEmail('Duplicate', ' ALICE@example.com ', 'StrongPass123!'));
    assert.equal(h.data.get('footprint_email_accounts'), undefined);
  });

  await test('Session restored only when verified Supabase session exists; forged local profile is ignored', async () => {
    const forged = { isLoggedIn: true, email: 'victim@example.com', name: 'Victim', authProvider: 'email', hasCompletedSetup: true, weightKg: 80 };
    const hForged = harness({ '@footprint_user_profile': JSON.stringify(forged) }, null);
    assert.equal((await hForged.mount()).user, null);

    const sbUser = { id: 'uid-real-1', email: 'a@example.com', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Alice' } };
    const hValid = harness({}, sbUser);
    const mounted = await hValid.mount();
    assert.equal(mounted.user.id, 'uid-real-1');
    assert.equal(mounted.user.provider, 'email');
  });

  await test('Nutrition, water and quiz isolated; returning owner retains entries', async () => {
    const h = harness(), s = h.load('constants/accountStorage.ts'), n = h.load('constants/nutritionStorage.ts');
    s.setActiveStorageAccount('a');
    await n.saveMealLog({ id: 'meal', dateKey: '2026-11-18' });
    await n.saveDailyWater('2026-11-18', 500);
    await n.saveQuizAnswers({ goal: 'bulk' });
    s.setActiveStorageAccount('b');
    assert.equal((await n.loadMealLogs()).length, 0);
    assert.equal(await n.loadDailyWater('2026-11-18'), 0);
    assert.equal(await n.loadSavedQuiz(), null);
    s.setActiveStorageAccount('a');
    assert.equal((await n.loadMealLogs()).length, 1);
    assert.equal(await n.loadDailyWater('2026-11-18'), 500);
    assert.equal((await n.loadSavedQuiz()).goal, 'bulk');
  });

  await test('Legacy nutrition copied once to original owner, never a new sign-up', async () => {
    const h = harness({ '@stridetrack_meal_logs': '[{"id":"old"}]', '@stridetrack_water_logs_2026-11-18': '300' });
    const s = h.load('constants/accountStorage.ts'), n = h.load('constants/nutritionStorage.ts');
    await s.prepareAccountStorage('new', 'old');
    s.setActiveStorageAccount('new');
    assert.equal((await n.loadMealLogs()).length, 0);
    await s.prepareAccountStorage('old', 'old');
    s.setActiveStorageAccount('old');
    assert.equal((await n.loadMealLogs())[0].id, 'old');
    await s.prepareAccountStorage('new', 'new');
    s.setActiveStorageAccount('new');
    assert.equal((await n.loadMealLogs()).length, 0);
    assert.equal(h.data.get('@stridetrack_meal_logs'), '[{"id":"old"}]');
  });

  console.log(checks + ' account regression checks passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
