import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-llmtxt-refresh-'));
const configKey = '_system/config.json';
const oldDate = '2000-01-01T00:00:00.000Z';

globalThis.crypto ??= webcrypto;

class MemoryBucket {
  objects = new Map();

  async get(key) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      customMetadata: { ...stored.metadata },
      text: async () => stored.value,
      json: async () => JSON.parse(stored.value),
    };
  }

  async put(key, value, options = {}) {
    this.objects.set(key, { value, metadata: { ...options.customMetadata } });
    return { key };
  }

  config() {
    return JSON.parse(this.objects.get(configKey).value);
  }
}

function cachedDomain(hostname, overrides = {}) {
  return {
    hostname,
    enabled: true,
    renderMode: 'ssr',
    status: 'cached',
    source: 'manual',
    lastUpdated: oldDate,
    ...overrides,
  };
}

async function fixture(t, domains, configOverrides = {}) {
  const bucket = new MemoryBucket();
  await bucket.put(configKey, JSON.stringify({
    mode: 'auto',
    aiPrompt: 'Summarize {{pages}} for {{hostname}}.',
    autoRefreshHours: 24,
    enableSpaFallback: false,
    domains: Object.fromEntries(domains.map((domain) => [domain.hostname, domain])),
    ...configOverrides,
  }));
  const attempts = [];
  const failing = new Set();
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    assert.ok(domains.some((domain) => domain.hostname === url.hostname), `Unexpected fetch: ${url}`);
    if (url.pathname === '/sitemap.xml') return new Response('', { status: 404 });
    assert.equal(url.pathname, '/');
    attempts.push(url.hostname);
    if (failing.has(url.hostname)) throw new Error('Temporary origin outage');
    return new Response('<!doctype html><html><head><title>Recovered site</title></head><body><h1>Recovered site</h1><p>This is the current documentation for the recovered site. Its latest content is available again.</p></body></html>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  };
  return { bucket, attempts, failing, env: { LLM_BUCKET: bucket } };
}

async function runScheduled(worker, env) {
  const pending = [];
  await worker.scheduled({}, env, { waitUntil(promise) { pending.push(promise); } });
  await Promise.all(pending);
}

try {
  execFileSync(process.execPath, [
    path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    'deploy', '--dry-run', '--outdir', buildDir,
  ], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: 'false',
      WRANGLER_LOG_PATH: path.join(buildDir, 'wrangler.log'),
    },
  });
  await fs.writeFile(path.join(buildDir, 'package.json'), '{"type":"module"}\n');
  const { default: worker } = await import(pathToFileURL(path.join(buildDir, 'index.js')).href);

  await test('a failed refresh preserves both cached files and retries after the origin recovers', async (t) => {
    const host = 'recover.example.com';
    const { bucket, attempts, failing, env } = await fixture(t, [cachedDomain(host)]);
    const mainKey = `domains/${host}/llms.txt`;
    const fullKey = `domains/${host}/llms-full.txt`;
    await bucket.put(mainKey, '# Previously cached index');
    await bucket.put(fullKey, '# Previously cached full content');
    failing.add(host);

    await runScheduled(worker, env);
    assert.equal(bucket.config().domains[host].status, 'error');
    assert.equal(bucket.config().domains[host].lastUpdated, oldDate);
    assert.equal(await (await bucket.get(mainKey)).text(), '# Previously cached index');
    assert.equal(await (await bucket.get(fullKey)).text(), '# Previously cached full content');

    failing.delete(host);
    await runScheduled(worker, env);
    const recovered = bucket.config().domains[host];
    assert.deepEqual(attempts, [host, host]);
    assert.equal(recovered.status, 'cached');
    assert.equal(recovered.lastError, undefined);
    assert.ok(Date.parse(recovered.lastUpdated) > Date.parse(oldDate));
    assert.ok(Date.parse(recovered.lastAttemptedAt) > Date.parse(oldDate));
    assert.match(await (await bucket.get(mainKey)).text(), /Recovered site/);
    assert.match(await (await bucket.get(fullKey)).text(), /Recovered site/);
  });

  await test('repeated failures do not starve other expired domains or exceed the two-domain budget', async (t) => {
    const hosts = ['first.example.com', 'second.example.com', 'third.example.com'];
    const { bucket, attempts, failing, env } = await fixture(t, hosts.map((host, i) => cachedDomain(host, {
      lastUpdated: `2000-01-0${i + 1}T00:00:00.000Z`,
    })));
    failing.add(hosts[0]);
    failing.add(hosts[1]);

    await runScheduled(worker, env);
    assert.deepEqual(attempts, hosts.slice(0, 2));
    assert.equal(bucket.config().domains[hosts[2]].lastAttemptedAt, undefined);
    await runScheduled(worker, env);
    assert.equal(attempts[2], hosts[2]);
    assert.equal(attempts.length, 4);
    assert.ok(hosts.slice(0, 2).includes(attempts[3]));
    assert.equal(bucket.config().domains[hosts[2]].status, 'cached');
  });

  await test('stored failed attempts are ordered after older pending refreshes', async (t) => {
    const retry = 'retry.example.com';
    const pending = 'pending.example.com';
    const { attempts, env } = await fixture(t, [
      cachedDomain(retry, { status: 'error', lastAttemptedAt: '2001-01-01T00:00:00.000Z' }),
      cachedDomain(pending, { lastUpdated: '2000-06-01T00:00:00.000Z' }),
    ]);
    await runScheduled(worker, env);
    assert.deepEqual(attempts, [pending, retry]);
  });

  await test('disabled, fresh, uncached, and never-successful domains are not refreshed', async (t) => {
    const domains = [
      cachedDomain('disabled.example.com', { enabled: false }),
      cachedDomain('disabled-error.example.com', { enabled: false, status: 'error' }),
      cachedDomain('fresh.example.com', { lastUpdated: new Date().toISOString() }),
      cachedDomain('fresh-error.example.com', { status: 'error', lastUpdated: new Date().toISOString() }),
      cachedDomain('never.example.com', { status: 'error', lastUpdated: undefined }),
      cachedDomain('uncached.example.com', { status: 'uncached' }),
      cachedDomain('generating.example.com', { status: 'generating' }),
    ];
    const { attempts, env } = await fixture(t, domains);
    await runScheduled(worker, env);
    assert.deepEqual(attempts, []);
  });

  await test('disabling automatic refresh also disables retries', async (t) => {
    const { attempts, env } = await fixture(t, [
      cachedDomain('cached.example.com'),
      cachedDomain('failed.example.com', { status: 'error' }),
    ], { autoRefreshHours: 0 });
    await runScheduled(worker, env);
    assert.deepEqual(attempts, []);
  });
} finally {
  await fs.rm(buildDir, { recursive: true, force: true });
}
