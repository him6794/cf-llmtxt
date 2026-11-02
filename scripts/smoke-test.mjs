import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3466;
const BASE = `http://127.0.0.1:${PORT}`;
const API = `${BASE}/_llmtxt/api`;

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

async function req(url, { method = 'GET', body, cookie, csrf = false, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (cookie) h.Cookie = cookie;
  if (csrf) h['X-LLMTXT-CSRF'] = '1';
  const res = await fetch(url, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, headers: res.headers, text, json };
}

function cookieFrom(res) {
  const sc = res.headers.get('set-cookie') || '';
  return sc.split(';')[0];
}

async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${BASE}/_llmtxt`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}

const r2Dir = path.join(root, '.r2-local');
await fs.rm(r2Dir, { recursive: true, force: true });

const server = spawn(process.execPath, ['scripts/dev-server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});

try {
  await waitReady();

  console.log('\n[dashboard]');
  const dash = await req(`${BASE}/_llmtxt`);
  check('dashboard 200', dash.status === 200);
  check('CSP present', /frame-ancestors 'none'/.test(dash.headers.get('content-security-policy') || ''));
  check('X-Frame-Options DENY', dash.headers.get('x-frame-options') === 'DENY');
  check('nosniff', dash.headers.get('x-content-type-options') === 'nosniff');
  check('no emoji in HTML', !/\p{Extended_Pictographic}/u.test(dash.text));
  check('no password in localStorage code', !/localStorage/.test(dash.text));
  const script = dash.text.match(/<script>([\s\S]*)<\/script>/)?.[1] || '';
  let syntaxOk = true;
  try {
    new Function(script);
  } catch (e) {
    syntaxOk = false;
    console.log('   ', e.message);
  }
  check('dashboard script parses', syntaxOk);

  console.log('\n[before first-run setup]');
  check('auth-status requiresSetup', (await req(`${API}/auth-status`)).json?.requiresSetup === true);
  check('GET /config blocked', (await req(`${API}/config`)).status === 403);
  check('POST /domains blocked', (await req(`${API}/domains`, { method: 'POST', body: { hostname: 'example.com' } })).status === 403);
  check('PUT /config blocked', (await req(`${API}/config`, { method: 'PUT', body: { config: {} } })).status === 403);
  check('/llms.txt?domain= blocked', (await req(`${BASE}/llms.txt?domain=example.com`)).status === 401);
  check('/llms.txt?refresh=1 blocked', (await req(`${BASE}/llms.txt?refresh=1`)).status === 401);
  check('login before setup rejected', (await req(`${API}/auth-login`, { method: 'POST', body: { password: 'x' } })).status === 409);

  console.log('\n[setup + session]');
  check('short password rejected', (await req(`${API}/auth-setup`, { method: 'POST', body: { password: 'abc' } })).status === 400);
  const setup = await req(`${API}/auth-setup`, { method: 'POST', body: { password: 'correct-horse-9' } });
  check('setup ok', setup.status === 200);
  const sc = setup.headers.get('set-cookie') || '';
  check('cookie HttpOnly', /HttpOnly/i.test(sc));
  check('cookie SameSite=Strict', /SameSite=Strict/i.test(sc));
  const cookie = cookieFrom(setup);
  check('second setup rejected', (await req(`${API}/auth-setup`, { method: 'POST', body: { password: 'attacker-pass-1' } })).status === 403);
  const authRaw = JSON.parse(await fs.readFile(path.join(r2Dir, '_system/auth.json'), 'utf-8'));
  check('password stored salted PBKDF2', Boolean(authRaw.salt) && authRaw.iterations >= 100000);
  check('plaintext password not stored', !JSON.stringify(authRaw).includes('correct-horse-9'));

  console.log('\n[authorization]');
  check('no cookie -> 401', (await req(`${API}/config`)).status === 401);
  check('forged cookie -> 401', (await req(`${API}/config`, { cookie: `llmtxt_session=${Math.floor(Date.now() / 1000) + 9999}.deadbeef` })).status === 401);
  check('expired cookie -> 401', (await req(`${API}/config`, { cookie: 'llmtxt_session=1.deadbeef' })).status === 401);
  const cfg = await req(`${API}/config`, { cookie });
  check('cookie GET /config ok', cfg.status === 200);
  check('PUT without CSRF header rejected', (await req(`${API}/config`, { method: 'PUT', cookie, body: { config: cfg.json.config } })).status === 401);
  check('cross-origin request rejected', (await req(`${API}/config`, { cookie, headers: { Origin: 'https://evil.example' } })).status === 403);
  check('Bearer password works (scripts)', (await req(`${API}/config`, { headers: { Authorization: 'Bearer correct-horse-9' } })).status === 200);
  check('Bearer wrong password fails', (await req(`${API}/config`, { headers: { Authorization: 'Bearer nope' } })).status === 401);
  check('legacy X-Admin-Password header not accepted', (await req(`${API}/config`, { headers: { 'X-Admin-Password': 'correct-horse-9' } })).status === 401);

  console.log('\n[input validation]');
  for (const bad of ['localhost', '127.0.0.1', "a'b.com", '__proto__.com', 'foo.workers.dev', 'x.internal', '<script>.com', '10.0.0.1', 'a..com', 'no-tld']) {
    const r = await req(`${API}/domains`, { method: 'POST', cookie, csrf: true, body: { hostname: bad } });
    check(`reject host ${bad}`, r.status === 400, `got ${r.status}`);
  }
  const good = await req(`${API}/domains`, { method: 'POST', cookie, csrf: true, body: { hostname: 'https://Example.COM/path?x=1' } });
  check('normalize + accept https://Example.COM/path', good.status === 200 && good.json.config.domains['example.com']);
  const evil = structuredClone(cfg.json.config);
  evil.domains["evil'onclick=alert(1).com"] = { hostname: 'x', enabled: true };
  evil.domains['ok.example.com'] = { enabled: false, renderMode: 'hax', status: 'cached', pageCount: 9999 };
  evil.maxPagesPerDomain = 99999;
  evil.aiModel = '../../etc/passwd';
  evil.cfZoneId = '<img src=x>';
  evil.cacheTtlSeconds = -5;
  evil.injected = 'x';
  const put = await req(`${API}/config`, { method: 'PUT', cookie, csrf: true, body: { config: evil } });
  check('PUT config ok', put.status === 200);
  const saved = put.json.config;
  check('bad hostname dropped', !Object.keys(saved.domains).some((k) => k.includes("'")));
  check('forged status/pageCount ignored', saved.domains['ok.example.com']?.status === 'uncached' && saved.domains['ok.example.com']?.pageCount === undefined);
  check('invalid renderMode ignored', saved.domains['ok.example.com']?.renderMode === 'auto');
  check('maxPages clamped', saved.maxPagesPerDomain === 40);
  check('bad aiModel ignored', saved.aiModel.startsWith('@cf/'));
  check('bad zone id ignored', saved.cfZoneId === '');
  check('ttl clamped', saved.cacheTtlSeconds >= 60);
  check('unknown field dropped', saved.injected === undefined);
  evil.aiPrompt = 'Custom prompt for {{hostname}}:\n{{pages}}';
  const putPrompt = await req(`${API}/config`, { method: 'PUT', cookie, csrf: true, body: { config: evil } });
  check('custom aiPrompt saved', putPrompt.json?.config?.aiPrompt?.startsWith('Custom prompt for {{hostname}}'));
  evil.aiPrompt = '';
  const resetPrompt = await req(`${API}/config`, { method: 'PUT', cookie, csrf: true, body: { config: evil } });
  check('empty aiPrompt resets to default', resetPrompt.json?.config?.aiPrompt?.includes('Zero Hallucination'));
  check('invalid JSON -> 400', (await fetch(`${API}/domains`, { method: 'POST', headers: { Cookie: cookie, 'X-LLMTXT-CSRF': '1', 'Content-Type': 'application/json' }, body: '{bad' })).status === 400);

  console.log('\n[secret handling]');
  const tokenSet = await req(`${API}/zones`, { method: 'POST', cookie, csrf: true, body: { apiToken: 'bogus-token-123' } });
  check('invalid CF token rejected', tokenSet.status >= 400);
  const afterToken = await req(`${API}/config`, { cookie });
  check('invalid token not persisted', afterToken.json.config.hasApiToken === false);
  await fs.writeFile(
    path.join(r2Dir, '_system/config.json'),
    JSON.stringify({ ...JSON.parse(await fs.readFile(path.join(r2Dir, '_system/config.json'), 'utf-8')), cfApiToken: 'SECRET-TOKEN-VALUE' })
  );
  const masked = await req(`${API}/config`, { cookie });
  check('API never returns token', !masked.text.includes('SECRET-TOKEN-VALUE'));
  const roundtrip = await req(`${API}/config`, { method: 'PUT', cookie, csrf: true, body: { config: masked.json.config } });
  check('masked token roundtrip keeps stored token', JSON.parse(await fs.readFile(path.join(r2Dir, '_system/config.json'), 'utf-8')).cfApiToken === 'SECRET-TOKEN-VALUE' && roundtrip.status === 200);

  console.log('\n[public llms.txt routes]');
  const own = await req(`${BASE}/llms.txt`);
  check('Worker own host returns notice, no crawl', own.status === 200 && own.text.includes('cf-llmtxt'));
  check('POST on llms.txt -> 405', (await req(`${BASE}/llms.txt`, { method: 'POST' })).status === 405);
  const content = '# Test\n\n<script>alert(1)</script>\n';
  const wr = await req(`${API}/content`, { method: 'PUT', cookie, csrf: true, body: { hostname: 'example.com', content } });
  check('content PUT ok', wr.status === 200);
  check('content PUT non-string rejected', (await req(`${API}/content`, { method: 'PUT', cookie, csrf: true, body: { hostname: 'example.com', content: { a: 1 } } })).status === 400);
  const served = await req(`${BASE}/llms.txt?domain=example.com`, { cookie });
  check('admin ?domain serves cached content', served.status === 200 && served.text === content);
  check('served as text/markdown', (served.headers.get('content-type') || '').startsWith('text/markdown'));
  check('served with nosniff', served.headers.get('x-content-type-options') === 'nosniff');
  check('invalid ?domain rejected', (await req(`${BASE}/llms.txt?domain=127.0.0.1`, { cookie })).status === 400);
  const traversal = await req(`${API}/content?hostname=${encodeURIComponent('../../_system/auth.json')}`, { cookie });
  check('R2 key traversal rejected', traversal.status === 400);

  console.log('\n[mode switch]');
  const manual = await req(`${API}/mode`, { method: 'POST', cookie, csrf: true, body: { mode: 'manual' } });
  check('switch manual', manual.json?.config?.mode === 'manual');
  const blocked = await req(`${BASE}/llms.txt?domain=ok.example.com`, { cookie });
  check('manual mode: disabled host -> 404', blocked.status === 404);
  await req(`${API}/mode`, { method: 'POST', cookie, csrf: true, body: { mode: 'auto' } });

  console.log('\n[crawler & contentHash]');
  const dead = await req(`${API}/generate`, { method: 'POST', cookie, csrf: true, body: { hostname: 'nonexistent-host-xyz-9999.com' } });
  check('unreachable host fails instead of faking content', dead.status === 500);
  const deadCache = await req(`${API}/content?hostname=nonexistent-host-xyz-9999.com`, { cookie });
  check('unreachable host not cached in R2', deadCache.json?.content === '');
  const realGen = await req(`${API}/generate`, { method: 'POST', cookie, csrf: true, body: { hostname: 'example.com' } });
  check('real crawl example.com ok', realGen.status === 200 && realGen.json?.result?.pageCount >= 1);
  check('contentHash recorded on domain entry', Boolean(realGen.json?.config?.domains?.['example.com']?.contentHash));

  console.log('\n[legacy password upgrade]');
  const legacyHash = crypto.createHash('sha256').update('legacy-pass-1').digest('hex');
  await fs.writeFile(path.join(r2Dir, '_system/auth.json'), JSON.stringify({ passwordHash: legacyHash, createdAt: new Date().toISOString() }));
  const legacyLogin = await req(`${API}/auth-login`, { method: 'POST', body: { password: 'legacy-pass-1' } });
  check('legacy hash login works', legacyLogin.status === 200);
  const upgraded = JSON.parse(await fs.readFile(path.join(r2Dir, '_system/auth.json'), 'utf-8'));
  check('legacy hash upgraded to PBKDF2', Boolean(upgraded.salt) && Boolean(upgraded.sessionSecret));
  check('old session invalid after upgrade', (await req(`${API}/config`, { cookie })).status === 401);
  const newCookie = cookieFrom(legacyLogin);
  check('new session valid', (await req(`${API}/config`, { cookie: newCookie })).status === 200);

  console.log('\n[logout]');
  const lo = await req(`${API}/auth-logout`, { method: 'POST', cookie: newCookie, csrf: true });
  check('logout clears cookie', /Max-Age=0/.test(lo.headers.get('set-cookie') || ''));

  console.log('\n[brute force]');
  let last = 0;
  for (let i = 0; i < 6; i++) {
    last = (await req(`${API}/auth-login`, { method: 'POST', body: { password: `wrong-${i}` } })).status;
  }
  check('locked after repeated failures', last === 429, `got ${last}`);
  check('correct password also locked', (await req(`${API}/auth-login`, { method: 'POST', body: { password: 'legacy-pass-1' } })).status === 429);
} finally {
  server.kill();
  await fs.rm(r2Dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
