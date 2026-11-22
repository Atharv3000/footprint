const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('.env is untracked from git and ignored in .gitignore', () => {
  const tracked = execFileSync('git', ['ls-files', '.env'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(tracked, '');
  const gitignore = read('.gitignore');
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
});

test('no public backend tokens or hardcoded passwords in source or .env.example', () => {
  const example = read('.env.example');
  assert.ok(!/EXPO_PUBLIC_REP_TOKEN\s*=/m.test(example));
  assert.ok(!/stridetrack_production_token/i.test(example));
  const demoPreload = read('constants/demoPreload.ts');
  assert.ok(!/password\s*:/i.test(demoPreload));
  const signIn = read('app/sign-in.tsx');
  assert.ok(!/signInWithGoogleDemo/.test(signIn));
  const renderYaml = read('render.yaml');
  assert.ok(!/REP_SERVER_TOKEN/.test(renderYaml));
  assert.match(renderYaml, /SUPABASE_JWT_SECRET/);
});

test('AuthContext does not perform client-side password hashing or local credential storage', () => {
  const auth = read('constants/AuthContext.tsx');
  assert.ok(!/EMAIL_ACCOUNTS_KEY|footprint_email_accounts|hashPassword|signInWithGoogleDemo/.test(auth));
  assert.match(auth, /supabase\.auth\.signInWithPassword/);
  assert.match(auth, /supabase\.auth\.signUp/);
  assert.match(auth, /supabase\.auth\.signInWithIdToken/);
});

test('supabase_schema.sql has zero permissive policies and isolates location data', () => {
  const sql = read('supabase_schema.sql');
  assert.ok(!/using\s*\(\s*true\s*\)/i.test(sql));
  assert.ok(!/with\s+check\s*\(\s*true\s*\)/i.test(sql));
  assert.match(sql, /drop column if exists current_location/i);
  assert.match(sql, /drop column if exists recent_trail/i);
  assert.match(sql, /create table if not exists public\.user_locations/i);
  assert.match(sql, /auth\.uid\(\)::text = id/);
  assert.match(sql, /create or replace function public\.accept_friend_request/i);
  assert.match(sql, /create or replace function public\.remove_friendship/i);
});

test('socialEngine never writes location to profiles and clears coordinates when private', () => {
  const social = read('constants/socialEngine.ts');
  assert.ok(!/\.from\('profiles'\)[\s\S]{0,400}current_location/.test(social));
  assert.match(social, /from\('user_locations'\)/);
  assert.match(social, /isPrivate \? null : data\.currentLocation/);
  assert.match(social, /accept_friend_request/);
});
