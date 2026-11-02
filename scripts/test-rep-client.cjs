const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

function load(fetcher) {
  const constants = { expoConfig: { hostUri: 'test.exp.direct' } };
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../constants/repTrackerProtocol.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const exports = {};
  const env = {};
  vm.runInNewContext(output, { exports, require: name => {
    assert.equal(name, 'expo-constants'); return { __esModule: true, default: constants };
  }, process: { env }, fetch: fetcher, AbortController, setTimeout, clearTimeout, console });
  return { ...exports, constants, env };
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('tunnel uses HTTPS; local development uses HTTP', () => {
  const api = load();
  assert.equal(api.repServerUrl(), 'https://test.exp.direct/rep-api');
  api.constants.expoConfig.hostUri = '192.168.1.4:8081';
  assert.equal(api.repServerUrl(), 'http://192.168.1.4:8081/rep-api');
});

test('opponents see complementary bar positions', () => {
  const api = load(); const battle = { players: ['host', 'guest'], host_share: .65 };
  assert.equal(api.ownShare(battle, 'host'), .65);
  assert.equal(api.ownShare(battle, 'guest'), .35);
});

test('transport authenticates, serializes commands, delivers frames, and closes', async () => {
  const calls = []; const messages = [];
  const api = load(async (url, options) => {
    calls.push({ url, options });
    const result = url.endsWith('/session') ? { session: 'private-session', player_id: 'public-id' }
      : url.endsWith('/frame') ? { messages: [{ type: 'pose', rep_count: 2 }] } : { messages: [] };
    return { ok: true, json: async () => result };
  });
  const connection = new api.RepConnection('https://test/rep-api');
  connection.onopen = () => {
    connection.send(JSON.stringify({ type: 'auth', token: 'test-token' }));
    connection.send(JSON.stringify({ type: 'reset', exercise: 'pushups' }));
    connection.send(JSON.stringify({ type: 'frame', image: 'fixture' }));
  };
  connection.onmessage = event => messages.push(JSON.parse(event.data));
  try {
    await wait(80);
    assert.ok(messages.some(m => m.type === 'connected' && m.player_id === 'public-id'));
    assert.ok(messages.some(m => m.type === 'pose' && m.rep_count === 2));
    const reset = calls.findIndex(c => c.url.endsWith('/command'));
    const frame = calls.findIndex(c => c.url.endsWith('/frame'));
    assert.ok(reset > 0 && frame > reset);
    assert.equal(calls[frame].options.headers['X-Rep-Session'], 'private-session');
    assert.equal(calls[frame].options.headers.Authorization, 'Bearer test-token');
  } finally { connection.close(); }
  assert.equal(connection.readyState, 3);
  assert.ok(calls.some(c => c.url.endsWith('/close')));
});

test('failed authentication reports the error and closes', async () => {
  const api = load(async () => ({ ok: false, json: async () => ({ detail: 'Session expired' }) }));
  const connection = new api.RepConnection('https://test/rep-api');
  const messages = [];
  connection.onmessage = e => messages.push(JSON.parse(e.data));
  connection.onopen = () => connection.send(JSON.stringify({ type: 'auth', token: 'bad' }));
  await wait(50);
  assert.equal(connection.readyState, 3);
  assert.ok(messages.some(m => m.type === 'error' && m.message === 'Session expired'));
});
