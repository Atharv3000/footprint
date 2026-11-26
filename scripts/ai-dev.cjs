// Starts the Footprint AI server (food photo, meal text, body fat, muscle photos) on port 9001.
// Usage: npm run start:ai            (LAN, no token)
//        FOOTPRINT_AI_TOKEN=secret npm run start:ai   (and set EXPO_PUBLIC_AI_TOKEN=secret in the app)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const python = process.env.REP_PYTHON || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!fs.existsSync(python)) {
  console.error('Python environment not found. Run:\n  python -m venv .venv\n  .venv/bin/python -m pip install -r server/requirements.txt   (Windows: .\\.venv\\Scripts\\python.exe ...)');
  process.exit(1);
}
const port = process.env.FOOTPRINT_AI_PORT || '9001';
function health() {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/health`, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => resolve(r.statusCode === 200)); });
    req.setTimeout(1000, () => req.destroy()); req.on('error', () => resolve(false));
  });
}
(async () => {
  if (await health()) { console.log(`Footprint AI already running on port ${port}.`); return; }
  const child = spawn(python, ['-m', 'footprint_ai.server', '--host', '0.0.0.0', '--port', port], { cwd: root, stdio: 'inherit', windowsHide: true });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill());
  child.on('exit', code => process.exit(code || 0));
  for (let i = 0; i < 160; i++) { if (await health()) { console.log(`Footprint AI ready on ws://<this-computer-ip>:${port}/ (food, meal text, body fat, muscle).`); return; } await new Promise(r => setTimeout(r, 250)); }
  console.error('Footprint AI did not become ready. Check the log above.');
})();
