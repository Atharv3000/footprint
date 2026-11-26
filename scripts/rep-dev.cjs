const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const python = process.env.REP_PYTHON || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!fs.existsSync(python)) { console.error('Set up .venv first. See docs/pushup-battles.md.'); process.exit(1); }
function readDotEnv(filePath) {
  const vars = {};
  try {
    for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      vars[key] = val;
    }
  } catch {}
  return vars;
}
const dotEnv = readDotEnv(path.join(root, '.env'));
// Explicit local sessions use Metro's authenticated localhost proxy without exposing tokens in the client bundle.
const devToken = crypto.randomBytes(32).toString('hex');
const serverEnv = {
  ...dotEnv,
  ...process.env,
  SUPABASE_URL: (process.env.SUPABASE_URL || dotEnv.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || dotEnv.EXPO_PUBLIC_SUPABASE_URL || '').trim(),
  SUPABASE_ANON_KEY: (process.env.SUPABASE_ANON_KEY || dotEnv.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || dotEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
  REP_SERVER_TOKEN: devToken,
  REP_ALLOW_DEV_TOKEN: '1',
};
const metroEnv = {
  ...process.env,
  EXPO_PUBLIC_REP_SERVER_URL: '',
  EXPO_PUBLIC_REP_TOKEN: '',
};
const children = [];
let stopping = false;
function killChild(c) {
  if (!c || c.killed || !c.pid) return;
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); return; } catch {}
  }
  try { c.kill(); } catch {}
}
function stop(code = 0) { if (stopping) return; stopping = true; for (const c of children) killChild(c); process.exitCode = code; }
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => stop());
function launch(command, args, env) {
  const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', e => { console.error(e.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
}
function httpHealthy(url, check) {
  return new Promise(resolve => {
    const req = http.get(url, r => {
      let body = ''; r.on('data', c => body += c); r.on('end', () => { try { resolve(r.statusCode === 200 && check(JSON.parse(body))); } catch { resolve(false); } });
    });
    req.setTimeout(1000, () => req.destroy()); req.on('error', () => resolve(false));
  });
}
function health() { return httpHealthy('http://127.0.0.1:9002/rep-api/health', d => !!d.ready); }
function aiHealth(port) { return httpHealthy(`http://127.0.0.1:${port}/health`, d => !!d.ok); }
(async () => {
  if (await health()) throw new Error('Rep server already runs on port 9002. Stop the old session first.');
  fs.mkdirSync(path.join(root, '.expo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.expo', 'rep-session-token'), devToken, { mode: 0o600 });
  launch(python, ['-m', 'uvicorn', 'server.app:app', '--host', '127.0.0.1', '--port', '9002', '--no-access-log', '--ws-max-size', '2900000'], serverEnv);
  let ready = false;
  for (let i = 0; i < 100 && !stopping; i++) { if (await health()) { ready = true; break; } await new Promise(r => setTimeout(r, 250)); }
  if (!ready || stopping) throw new Error('Rep server failed to start. Check Python dependencies and the pose model.');
  console.log('Pose-based rep analysis and live camera battles ready. Side-on push-ups are recommended.');
  const aiPort = process.env.FOOTPRINT_AI_PORT || '9001';
  if (process.env.FOOTPRINT_AI_DISABLE !== '1') {
    if (await aiHealth(aiPort)) {
      console.log(`Footprint AI already running on port ${aiPort}.`);
    } else {
      // Not tied to the rep server's lifetime: if the AI server fails, rep tracking keeps working.
      const ai = spawn(python, ['-m', 'footprint_ai.server', '--host', '0.0.0.0', '--port', aiPort], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true });
      children.push(ai);
      ai.on('exit', code => { if (!stopping) console.error(`Footprint AI server exited (${code}); food/body-fat AI unavailable. Run "npm run start:ai" to see why.`); });
      console.log(`Footprint AI (food photo, meal text, body fat, muscle photos) starting on port ${aiPort}.`);
    }
  }
  const args = process.argv.slice(2);
  const expoArgs = ['start', ...(args.includes('--clear') ? [] : ['--clear']), ...(args.includes('--tunnel') ? ['--tunnel', 'ngrok'] : args)];
  launch(process.execPath, [require.resolve('expo/bin/cli'), ...expoArgs], metroEnv);
})().catch(e => { console.error(e.message); stop(1); });
