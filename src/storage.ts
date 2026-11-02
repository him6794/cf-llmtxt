import { DEFAULT_AI_PROMPT } from './ai';
import { DomainEntry, Env, RenderMode, SystemConfig, ZoneRouteStatus } from './types';

const CONFIG_KEY = '_system/config.json';
export const MASKED_TOKEN = '••••••••••••••••';

export function getDefaultConfig(env: Env): SystemConfig {
  return {
    mode: env.DEFAULT_MODE === 'manual' ? 'manual' : 'auto',
    defaultRenderMode: 'auto',
    maxPagesPerDomain: 25,
    cacheTtlSeconds: 3600,
    autoRefreshHours: 24,
    aiModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    aiPrompt: DEFAULT_AI_PROMPT,
    enableSpaFallback: true,
    cfZoneId: env.CF_ZONE_ID || '',
    cfAccountId: env.CF_ACCOUNT_ID || '',
    cfApiToken: env.CF_API_TOKEN || '',
    zones: [],
    domains: {},
    updatedAt: new Date().toISOString(),
  };
}

export async function getSystemConfig(env: Env): Promise<SystemConfig> {
  try {
    const obj = await env.LLM_BUCKET.get(CONFIG_KEY);
    if (!obj) {
      const initial = getDefaultConfig(env);
      await saveSystemConfig(env, initial);
      return initial;
    }
    const parsed = await obj.json<Partial<SystemConfig>>();
    const defaults = getDefaultConfig(env);
    let dirty = false;
    if (
      parsed.aiModel === '@cf/meta/llama-3.1-8b-instruct' ||
      parsed.aiModel === '@cf/meta/llama-3.1-8b-instruct-fast'
    ) {
      parsed.aiModel = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
      dirty = true;
    }
    if (!parsed.aiPrompt || parsed.aiPrompt.startsWith('你是一位嚴謹的技術文件工程師')) {
      parsed.aiPrompt = DEFAULT_AI_PROMPT;
      dirty = true;
    }
    const merged: SystemConfig = {
      ...defaults,
      ...parsed,
      domains: parsed.domains || {},
    };
    if (dirty) {
      await saveSystemConfig(env, merged, merged);
    }
    return merged;
  } catch {
    return getDefaultConfig(env);
  }
}

export function sanitizeConfigForClient(config: SystemConfig): SystemConfig & { hasApiToken: boolean } {
  const hasToken = Boolean(config.cfApiToken && config.cfApiToken.trim().length > 0);
  return {
    ...config,
    cfApiToken: hasToken ? MASKED_TOKEN : '',
    hasApiToken: hasToken,
  };
}

export async function saveSystemConfig(
  env: Env,
  incoming: SystemConfig,
  existingConfig?: SystemConfig
): Promise<SystemConfig> {
  const current = existingConfig || (await getRawConfigOrNull(env));
  if (
    (incoming.cfApiToken === MASKED_TOKEN || !incoming.cfApiToken) &&
    current?.cfApiToken &&
    incoming.cfApiToken !== ''
  ) {
    incoming.cfApiToken = current.cfApiToken;
  }
  incoming.updatedAt = new Date().toISOString();
  await env.LLM_BUCKET.put(CONFIG_KEY, JSON.stringify(incoming, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
  return incoming;
}

async function getRawConfigOrNull(env: Env): Promise<SystemConfig | null> {
  try {
    const obj = await env.LLM_BUCKET.get(CONFIG_KEY);
    if (!obj) return null;
    return await obj.json<SystemConfig>();
  } catch {
    return null;
  }
}

export function getDomainKey(hostname: string, full = false): string {
  const cleanHost = hostname.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return `domains/${cleanHost}/${full ? 'llms-full.txt' : 'llms.txt'}`;
}

export async function getDomainLlmsTxt(
  env: Env,
  hostname: string,
  full = false
): Promise<{ content: string; metadata?: Record<string, string> } | null> {
  const key = getDomainKey(hostname, full);
  const obj = await env.LLM_BUCKET.get(key);
  if (!obj) return null;
  const content = await obj.text();
  return {
    content,
    metadata: obj.customMetadata,
  };
}

export async function saveDomainLlmsTxt(
  env: Env,
  hostname: string,
  llmsTxt: string,
  llmsFullTxt?: string,
  metadata: Record<string, string> = {}
): Promise<void> {
  const cleanHost = hostname.trim().toLowerCase();
  await env.LLM_BUCKET.put(getDomainKey(cleanHost, false), llmsTxt, {
    httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
    customMetadata: {
      hostname: cleanHost,
      updatedAt: new Date().toISOString(),
      ...metadata,
    },
  });

  if (llmsFullTxt !== undefined) {
    await env.LLM_BUCKET.put(getDomainKey(cleanHost, true), llmsFullTxt, {
      httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
      customMetadata: {
        hostname: cleanHost,
        updatedAt: new Date().toISOString(),
        ...metadata,
      },
    });
  }
}

export async function deleteDomainCache(env: Env, hostname: string): Promise<void> {
  const cleanHost = hostname.trim().toLowerCase();
  await env.LLM_BUCKET.delete([
    getDomainKey(cleanHost, false),
    getDomainKey(cleanHost, true),
  ]);
}

export async function ensureDomainEntry(
  env: Env,
  config: SystemConfig,
  hostname: string,
  source: DomainEntry['source'] = 'traffic'
): Promise<DomainEntry> {
  const cleanHost = hostname.trim().toLowerCase();
  if (!config.domains[cleanHost]) {
    config.domains[cleanHost] = {
      hostname: cleanHost,
      enabled: config.mode === 'auto',
      renderMode: config.defaultRenderMode || 'auto',
      status: 'uncached',
      source,
    };
    await saveSystemConfig(env, config, config);
  }
  return config.domains[cleanHost];
}

export async function listCloudflareZones(
  env: Env,
  config: SystemConfig,
  tokenOverride?: string
): Promise<Array<{ id: string; name: string; status: string }>> {
  const apiToken =
    tokenOverride && tokenOverride !== MASKED_TOKEN
      ? tokenOverride.trim()
      : config.cfApiToken || env.CF_API_TOKEN || '';

  if (!apiToken) {
    throw new Error('請先提供 Cloudflare API Token');
  }

  const res = await fetch('https://api.cloudflare.com/client/v4/zones?status=active&per_page=50', {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cloudflare Zones API 驗證失敗 (${res.status}): 請確認 Token 具備 Zone:Read 權限 (${errText.slice(0, 120)})`);
  }

  const data = (await res.json()) as {
    success: boolean;
    result?: Array<{ id: string; name: string; status: string }>;
  };

  return (data.result || []).map((z) => ({
    id: z.id,
    name: z.name,
    status: z.status,
  }));
}

export async function scanCloudflareDnsSubdomains(
  env: Env,
  config: SystemConfig,
  options: {
    bindRoutes?: boolean;
    selectedZoneIds?: string[];
    apiTokenOverride?: string;
    workerNameOverride?: string;
  } = { bindRoutes: true }
): Promise<{
  discovered: string[];
  total: number;
  zonesConfigured: ZoneRouteStatus[];
}> {
  if (options.apiTokenOverride && options.apiTokenOverride !== MASKED_TOKEN) {
    config.cfApiToken = options.apiTokenOverride.trim();
  }

  const apiToken = config.cfApiToken || env.CF_API_TOKEN;
  const specificZoneId = (config.cfZoneId || env.CF_ZONE_ID || '').trim();
  const workerName = (options.workerNameOverride || env.WORKER_NAME || 'cf-llmtxt').trim();

  if (!apiToken) {
    throw new Error(
      '請先設定 Cloudflare API Token（需具備 Zone:Read、DNS:Read、Workers Routes:Edit 權限）'
    );
  }

  const headers = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  let zones: Array<{ id: string; name: string }> = [];
  if (options.selectedZoneIds && options.selectedZoneIds.length > 0) {
    const allZones = await listCloudflareZones(env, config, apiToken);
    const idSet = new Set(options.selectedZoneIds);
    zones = allZones.filter((z) => idSet.has(z.id));
  } else if (specificZoneId) {
    const zRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(specificZoneId)}`,
      { headers }
    );
    if (!zRes.ok) {
      throw new Error(`無法讀取指定的 Zone ID (${zRes.status})，請確認 Token 權限或留空讓系統自動搜尋所有網域`);
    }
    const zData = (await zRes.json()) as { success: boolean; result?: { id: string; name: string } };
    if (zData.result) {
      zones.push({ id: zData.result.id, name: zData.result.name });
    }
  } else {
    zones = await listCloudflareZones(env, config, apiToken);
  }

  if (zones.length === 0) {
    throw new Error('在此 Cloudflare 帳號/Token 下找不到任何有效的網域 (Zone)');
  }

  const allowedTypes = new Set(['A', 'AAAA', 'CNAME']);
  const discovered: string[] = [];
  const zonesConfigured: ZoneRouteStatus[] = [];

  for (const zone of zones) {
    const routesBound: string[] = [];

    if (options.bindRoutes !== false) {
      const targetPatterns = [
        `*${zone.name}/llm.txt`,
        `*${zone.name}/llms.txt`,
        `*${zone.name}/llms-full.txt`,
      ];

      try {
        const existingRoutesRes = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zone.id)}/workers/routes`,
          { headers }
        );
        const existingPatterns = new Set<string>();
        if (existingRoutesRes.ok) {
          const existingData = (await existingRoutesRes.json()) as {
            result?: Array<{ pattern: string; script?: string }>;
          };
          for (const r of existingData.result || []) {
            if (r.script === workerName) {
              existingPatterns.add(r.pattern);
              routesBound.push(r.pattern);
            }
          }
        }

        for (const pattern of targetPatterns) {
          if (existingPatterns.has(pattern)) continue;
          const createRouteRes = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zone.id)}/workers/routes`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({
                pattern,
                script: workerName,
              }),
            }
          );
          if (createRouteRes.ok) {
            routesBound.push(pattern);
          }
        }
      } catch {

      }
    }

    let zoneSubdomainCount = 0;
    try {
      const dnsRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zone.id)}/dns_records?per_page=100`,
        { headers }
      );
      if (dnsRes.ok) {
        const dnsData = (await dnsRes.json()) as {
          success: boolean;
          result?: Array<{ type: string; name: string }>;
        };
        for (const record of dnsData.result || []) {
          if (!allowedTypes.has(record.type)) continue;
          const host = record.name.trim().toLowerCase();
          if (!isValidPublicHostname(host)) continue;
          zoneSubdomainCount++;

          if (!config.domains[host]) {
            config.domains[host] = {
              hostname: host,
              enabled: config.mode === 'auto',
              renderMode: config.defaultRenderMode || 'auto',
              status: 'uncached',
              source: 'dns',
            };
            discovered.push(host);
          }
        }
      }
    } catch {

    }

    zonesConfigured.push({
      zoneId: zone.id,
      zoneName: zone.name,
      routesBound,
      subdomainsCount: zoneSubdomainCount,
    });
  }

  config.zones = zonesConfigured;
  await saveSystemConfig(env, config, config);

  return {
    discovered,
    total: Object.keys(config.domains).length,
    zonesConfigured,
  };
}

export async function ensureWorkerRouteForDomain(
  env: Env,
  config: SystemConfig,
  hostname: string
): Promise<boolean> {
  const apiToken = config.cfApiToken || env.CF_API_TOKEN;
  if (!apiToken || apiToken === MASKED_TOKEN) return false;

  try {
    const zones = await listCloudflareZones(env, config, apiToken);
    const matchingZone = zones.find(
      (z) => hostname === z.name || hostname.endsWith(`.${z.name}`)
    );
    if (!matchingZone) return false;

    const workerName = (env.WORKER_NAME || 'cf-llmtxt').trim();
    const headers = {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };

    const existingRoutesRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(matchingZone.id)}/workers/routes`,
      { headers }
    );
    const existingPatterns = new Set<string>();
    if (existingRoutesRes.ok) {
      const existingData = (await existingRoutesRes.json()) as {
        result?: Array<{ pattern: string; script?: string }>;
      };
      for (const r of existingData.result || []) {
        if (r.script === workerName) existingPatterns.add(r.pattern);
      }
    }

    const targetPatterns = [
      `*${matchingZone.name}/llm.txt`,
      `*${matchingZone.name}/llms.txt`,
      `*${matchingZone.name}/llms-full.txt`,
    ];

    for (const pattern of targetPatterns) {
      if (existingPatterns.has(pattern)) continue;
      await fetch(
        `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(matchingZone.id)}/workers/routes`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ pattern, script: workerName }),
        }
      );
    }
    return true;
  } catch {
    return false;
  }
}

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/;
const BLOCKED_SUFFIXES = ['.local', '.internal', '.localhost', '.lan', '.home.arpa', '.workers.dev'];

export function normalizeHostname(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

export function isValidPublicHostname(host: string): boolean {
  if (!HOSTNAME_RE.test(host)) return false;
  return !BLOCKED_SUFFIXES.some((s) => host.endsWith(s));
}

const RENDER_MODES: RenderMode[] = ['auto', 'ssr', 'spa'];
const ID32_RE = /^[a-f0-9]{32}$/i;
const MODEL_RE = /^@cf\/[A-Za-z0-9._\-\/]+$/;

export function sanitizeIncomingConfig(incoming: any, existing: SystemConfig): SystemConfig {
  const num = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
  };
  const idOrEmpty = (v: unknown, fallback: string) => {
    if (typeof v !== 'string') return fallback;
    const t = v.trim();
    return t === '' || ID32_RE.test(t) ? t : fallback;
  };

  const domains: Record<string, DomainEntry> = {};
  const src = incoming && typeof incoming.domains === 'object' && incoming.domains ? incoming.domains : {};
  for (const key of Object.keys(src)) {
    const host = normalizeHostname(key);
    if (!isValidPublicHostname(host)) continue;
    const prev = existing.domains[host];
    const entry = src[key] || {};
    domains[host] = {
      ...(prev || { status: 'uncached', source: 'manual' }),
      hostname: host,
      enabled: typeof entry.enabled === 'boolean' ? entry.enabled : prev?.enabled ?? true,
      renderMode: RENDER_MODES.includes(entry.renderMode) ? entry.renderMode : prev?.renderMode || 'auto',
      customTitle:
        typeof entry.customTitle === 'string' ? entry.customTitle.slice(0, 200) : prev?.customTitle,
      customDescription:
        typeof entry.customDescription === 'string'
          ? entry.customDescription.slice(0, 1000)
          : prev?.customDescription,
    };
  }

  const token = typeof incoming?.cfApiToken === 'string' ? incoming.cfApiToken.trim() : '';
  return {
    ...existing,
    mode: incoming?.mode === 'manual' ? 'manual' : 'auto',
    defaultRenderMode: RENDER_MODES.includes(incoming?.defaultRenderMode)
      ? incoming.defaultRenderMode
      : existing.defaultRenderMode,
    maxPagesPerDomain: num(incoming?.maxPagesPerDomain, 1, 40, existing.maxPagesPerDomain),
    cacheTtlSeconds: num(incoming?.cacheTtlSeconds, 60, 7 * 86400, existing.cacheTtlSeconds),
    autoRefreshHours: num(incoming?.autoRefreshHours, 0, 24 * 30, existing.autoRefreshHours ?? 24),
    aiModel:
      typeof incoming?.aiModel === 'string' && MODEL_RE.test(incoming.aiModel.trim())
        ? incoming.aiModel.trim()
        : existing.aiModel,
    aiPrompt:
      typeof incoming?.aiPrompt === 'string'
        ? incoming.aiPrompt.trim().slice(0, 8000) || DEFAULT_AI_PROMPT
        : existing.aiPrompt || DEFAULT_AI_PROMPT,
    enableSpaFallback:
      typeof incoming?.enableSpaFallback === 'boolean'
        ? incoming.enableSpaFallback
        : existing.enableSpaFallback,
    cfZoneId: idOrEmpty(incoming?.cfZoneId, existing.cfZoneId || ''),
    cfAccountId: idOrEmpty(incoming?.cfAccountId, existing.cfAccountId || ''),

    cfApiToken: token === MASKED_TOKEN || token === '' ? existing.cfApiToken : token,
    domains,
  };
}
