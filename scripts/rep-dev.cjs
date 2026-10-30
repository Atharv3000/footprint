const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const python = process.env.REP_PYTHON || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!fs.existsSync(python)) { console.error('Set up .venv first. See docs/pushup-battles.md.'); process.exit(1); }
const env = { ...process.env, REP_SERVER_TOKEN: crypto.randomBytes(32).toString('hex') };
env.EXPO_PUBLIC_REP_TOKEN = env.REP_SERVER_TOKEN;
fs.mkdirSync(path.join(root, '.expo'), { recursive: true });
fs.writeFileSync(path.join(root, '.expo', 'rep-session-token'), env.REP_SERVER_TOKEN, { mode: 0o600 });
const children = [];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const c of children) c.kill(); process.exitCode = code; }
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => stop());
function launch(command, args) {
  const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', e => { console.error(e.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
}
function health() {
  return new Promise(resolve => {
    const req = http.get('http://127.0.0.1:9002/rep-api/health', r => {
      let body = ''; r.on('data', c => body += c); r.on('end', () => { try { resolve(r.statusCode === 200 && JSON.parse(body).ready); } catch { resolve(false); } });
    });
    req.setTimeout(1000, () => req.destroy()); req.on('error', () => resolve(false));
  });
}
(async () => {
  if (await health()) throw new Error('Rep server already runs on port 9002. Stop the old session first.');
  launch(python, ['-m', 'uvicorn', 'server.app:app', '--host', '127.0.0.1', '--port', '9002', '--no-access-log', '--ws-max-size', '2900000']);
  let ready = false;
  for (let i = 0; i < 100 && !stopping; i++) { if (await health()) { ready = true; break; } await new Promise(r => setTimeout(r, 250)); }
  if (!ready || stopping) throw new Error('Rep server failed to start. Check Python dependencies and the pose model.');
  console.log('Pose-based rep analysis and live camera battles ready. Side-on push-ups are recommended.');
  const args = process.argv.slice(2);
  launch(process.execPath, [require.resolve('expo/bin/cli'), 'start', ...(args.includes('--tunnel') ? ['--tunnel', 'ngrok'] : args)]);
})().catch(e => { console.error(e.message); stop(1); });
