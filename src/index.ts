import { generateAndStoreLlmsTxt } from './ai';
import {
  buildClearCookie,
  buildSessionCookie,
  clearLoginFailures,
  createSessionToken,
  getAuthStatus,
  isAdminRequest,
  isLoginLocked,
  MIN_PASSWORD_LENGTH,
  recordLoginFailure,
  setAdminPassword,
  verifyPassword,
} from './auth';
import { renderDashboardHtml } from './dashboard';
import {
  deleteDomainCache,
  ensureDomainEntry,
  ensureWorkerRouteForDomain,
  getDomainLlmsTxt,
  getSystemConfig,
  isValidPublicHostname,
  listCloudflareZones,
  normalizeHostname,
  sanitizeConfigForClient,
  sanitizeIncomingConfig,
  saveDomainLlmsTxt,
  saveSystemConfig,
  scanCloudflareDnsSubdomains,
} from './storage';
import { Env, GenerationResult, RenderMode } from './types';

const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_TRAFFIC_DOMAINS = 100;
const RENDER_MODES: RenderMode[] = ['auto', 'ssr', 'spa'];

const DASHBOARD_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

function baseSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...baseSecurityHeaders(),
      ...extraHeaders,
    },
  });
}

function markdownResponse(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      ...baseSecurityHeaders(),
      ...extra,
    },
  });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function readJson<T = any>(request: Request): Promise<T> {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY_BYTES) throw new HttpError(413, '請求內容過大');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, '請求內容過大');
  try {
    const parsed = JSON.parse(text || '{}');
    if (!parsed || typeof parsed !== 'object') throw new Error();
    return parsed as T;
  } catch {
    throw new HttpError(400, 'JSON 格式錯誤');
  }
}

function requireHost(raw: unknown): string {
  const host = normalizeHostname(typeof raw === 'string' ? raw : '');
  if (!isValidPublicHostname(host)) throw new HttpError(400, '無效的網域名稱');
  return host;
}

const inflight = new Map<string, Promise<GenerationResult>>();

function generateOnce(
  host: string,
  env: Env,
  config: Awaited<ReturnType<typeof getSystemConfig>>,
  force = false
) {
  let p = inflight.get(host);
  if (!p) {
    p = generateAndStoreLlmsTxt(host, env, config, { force }).finally(() => inflight.delete(host));
    inflight.set(host, p);
  }
  return p;
}

const REFRESH_PER_RUN = 2;

async function refreshDueDomains(env: Env): Promise<void> {
  const config = await getSystemConfig(env);
  const hours = config.autoRefreshHours ?? 24;
  if (!hours || hours <= 0) return;
  const cutoff = Date.now() - hours * 3600 * 1000;
  const due = Object.values(config.domains)
    .filter((d) => d.enabled && d.status === 'cached' && d.lastUpdated && Date.parse(d.lastUpdated) < cutoff)
    .sort((a, b) => Date.parse(a.lastUpdated!) - Date.parse(b.lastUpdated!))
    .slice(0, REFRESH_PER_RUN);
  for (const d of due) {
    try {
      await generateOnce(d.hostname, env, config, false);
    } catch {

    }
  }
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refreshDueDomains(env));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const adminBase = env.ADMIN_PATH || '/_llmtxt';
    const secureCookie = url.protocol === 'https:';

    if (request.headers.get('X-CF-LLMTXT-Crawler') === '1') {
      return new Response('Crawler loop guard', { status: 204 });
    }

    if (pathname === '/llm.txt' || pathname === '/llms.txt' || pathname === '/llms-full.txt') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return markdownResponse('Method Not Allowed', 405, { Allow: 'GET, HEAD' });
      }

      const isFull = pathname === '/llms-full.txt';
      const queryDomain = url.searchParams.get('domain');
      const forceRefresh = url.searchParams.get('refresh') === '1';

      if (queryDomain || forceRefresh) {
        if (!(await isAdminRequest(request, env))) {
          return markdownResponse('Unauthorized: ?domain and ?refresh require admin login.', 401);
        }
      }

      const targetHost = normalizeHostname(queryDomain || url.hostname);
      const onDefaultHost =
        !queryDomain &&
        (targetHost === 'localhost' ||
          targetHost === '127.0.0.1' ||
          targetHost.endsWith('.workers.dev'));

      if (onDefaultHost) {
        return markdownResponse(
          `# cf-llmtxt\n\nThis is the Worker's own address, which has no site to index.\n\nOpen the dashboard to bind your domains: ${url.origin}${adminBase}\n`
        );
      }
      if (!isValidPublicHostname(targetHost)) {
        return markdownResponse('Invalid host.', 400);
      }

      const config = await getSystemConfig(env);
      const domainEntry = config.domains[targetHost];

      if (config.mode === 'manual' && !domainEntry?.enabled) {
        if (!domainEntry) {
          ctx.waitUntil(ensureDomainEntry(env, config, targetHost, 'traffic'));
        }
        return markdownResponse(
          `# 404 llms.txt Not Enabled\n\nDomain "${targetHost}" is not enabled under Manual Selection Mode.\n`,
          404
        );
      }
      if (domainEntry && !domainEntry.enabled && config.mode === 'auto' && domainEntry.source !== 'traffic') {

        return markdownResponse(`# 404 llms.txt Disabled\n\nDomain "${targetHost}" is disabled.\n`, 404);
      }

      if (!domainEntry) {
        const trafficCount = Object.values(config.domains).filter((d) => d.source === 'traffic').length;
        if (trafficCount >= MAX_TRAFFIC_DOMAINS) {
          return markdownResponse('Too many unregistered hosts. Add this host in the dashboard first.', 429);
        }
      }

      if (!forceRefresh) {
        const cached = await getDomainLlmsTxt(env, targetHost, isFull);
        if (cached) {
          return markdownResponse(cached.content, 200, {
            'Cache-Control': `public, max-age=${config.cacheTtlSeconds || 3600}`,
            'X-LLMTXT-Cache': 'HIT',
            'X-LLMTXT-Domain': targetHost,
          });
        }
      }

      try {
        const result = await generateOnce(targetHost, env, config, forceRefresh);
        return markdownResponse(isFull ? result.llmsFullTxt : result.llmsTxt, 200, {
          'Cache-Control': `public, max-age=${config.cacheTtlSeconds || 3600}`,
          'X-LLMTXT-Cache': 'MISS-GENERATED',
          'X-LLMTXT-Domain': targetHost,
          'X-LLMTXT-Used-AI': String(result.usedAI),
          'X-LLMTXT-SPA': String(result.detectedSpa),
        });
      } catch {
        return markdownResponse(`Could not generate llms.txt for ${targetHost}. Try again later.`, 502, {
          'Cache-Control': 'no-store',
        });
      }
    }

    if (pathname === '/' || pathname === adminBase || pathname === `${adminBase}/`) {
      return new Response(renderDashboardHtml(), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': DASHBOARD_CSP,
          'X-Frame-Options': 'DENY',
          ...baseSecurityHeaders(),
        },
      });
    }

    if (pathname.startsWith(`${adminBase}/api/`)) {
      const apiPath = pathname.slice(`${adminBase}/api`.length);

      try {

        const origin = request.headers.get('Origin');
        if (origin && origin !== url.origin) {
          throw new HttpError(403, '不允許跨來源請求');
        }

        const authStatus = await getAuthStatus(env);
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

        if (apiPath === '/auth-status' && request.method === 'GET') {
          const authenticated = authStatus.requiresSetup ? false : await isAdminRequest(request, env);
          return jsonResponse({
            requiresSetup: authStatus.requiresSetup,
            envProtected: authStatus.envProtected,
            authenticated,
          });
        }

        if (apiPath === '/auth-setup' && request.method === 'POST') {
          if (!authStatus.requiresSetup) {
            throw new HttpError(403, '管理員密碼已設定過，請直接登入');
          }
          const body = await readJson<{ password?: string }>(request);
          const pwd = typeof body.password === 'string' ? body.password.trim() : '';
          if (pwd.length < MIN_PASSWORD_LENGTH) {
            throw new HttpError(400, `密碼長度至少需 ${MIN_PASSWORD_LENGTH} 個字元`);
          }
          if (!(await setAdminPassword(env, pwd))) {
            throw new HttpError(403, '管理員密碼已設定過，請直接登入');
          }
          const token = await createSessionToken(env);
          return jsonResponse({ ok: true }, 200, {
            'Set-Cookie': buildSessionCookie(token || '', secureCookie),
          });
        }

        if (apiPath === '/auth-login' && request.method === 'POST') {
          if (authStatus.requiresSetup) throw new HttpError(409, '尚未設定管理員密碼');
          if (isLoginLocked(ip)) throw new HttpError(429, '嘗試次數過多，請 15 分鐘後再試');
          const body = await readJson<{ password?: string }>(request);
          const valid = await verifyPassword(env, typeof body.password === 'string' ? body.password : '');
          if (!valid) {
            recordLoginFailure(ip);
            throw new HttpError(401, '密碼不正確');
          }
          clearLoginFailures(ip);
          const token = await createSessionToken(env);
          return jsonResponse({ ok: true }, 200, {
            'Set-Cookie': buildSessionCookie(token || '', secureCookie),
          });
        }

        if (apiPath === '/auth-logout' && request.method === 'POST') {
          return jsonResponse({ ok: true }, 200, { 'Set-Cookie': buildClearCookie(secureCookie) });
        }

        if (authStatus.requiresSetup) {
          return jsonResponse({ error: '請先設定管理員密碼', requiresSetup: true }, 403);
        }
        if (!(await isAdminRequest(request, env))) {
          return jsonResponse({ error: '未登入或登入已過期', unauthorized: true }, 401);
        }

        if (apiPath === '/config') {
          if (request.method === 'GET') {
            return jsonResponse({ config: sanitizeConfigForClient(await getSystemConfig(env)) });
          }
          if (request.method === 'PUT') {
            const body = await readJson<{ config?: unknown }>(request);
            if (!body.config) throw new HttpError(400, 'Missing config payload');
            const existing = await getSystemConfig(env);
            const saved = await saveSystemConfig(env, sanitizeIncomingConfig(body.config, existing), existing);
            return jsonResponse({ config: sanitizeConfigForClient(saved) });
          }
        }

        if (apiPath === '/mode' && request.method === 'POST') {
          const body = await readJson<{ mode?: string }>(request);
          const config = await getSystemConfig(env);
          config.mode = body.mode === 'manual' ? 'manual' : 'auto';
          await saveSystemConfig(env, config, config);
          return jsonResponse({ config: sanitizeConfigForClient(config) });
        }

        if (apiPath === '/domains') {
          const config = await getSystemConfig(env);

          if (request.method === 'POST') {
            const body = await readJson<{ hostname?: string; renderMode?: RenderMode; enabled?: boolean }>(request);
            const host = requireHost(body.hostname);
            const existing = await getDomainLlmsTxt(env, host, false);
            config.domains[host] = {
              hostname: host,
              enabled: body.enabled ?? true,
              renderMode: RENDER_MODES.includes(body.renderMode as RenderMode)
                ? (body.renderMode as RenderMode)
                : config.defaultRenderMode || 'auto',
              status: existing ? 'cached' : 'uncached',
              source: 'manual',
            };
            await ensureWorkerRouteForDomain(env, config, host);
            await saveSystemConfig(env, config, config);
            return jsonResponse({ config: sanitizeConfigForClient(config) });
          }

          if (request.method === 'PATCH') {
            const body = await readJson<{ hostname?: string; enabled?: boolean; renderMode?: RenderMode }>(request);
            const host = requireHost(body.hostname);
            if (!config.domains[host]) throw new HttpError(404, '找不到該子網域');
            if (typeof body.enabled === 'boolean') config.domains[host].enabled = body.enabled;
            if (body.renderMode && RENDER_MODES.includes(body.renderMode)) {
              config.domains[host].renderMode = body.renderMode;
            }
            await saveSystemConfig(env, config, config);
            return jsonResponse({ config: sanitizeConfigForClient(config) });
          }

          if (request.method === 'DELETE') {
            const host = requireHost(url.searchParams.get('hostname'));
            if (config.domains[host]) {
              delete config.domains[host];
              await deleteDomainCache(env, host);
              await saveSystemConfig(env, config, config);
            }
            return jsonResponse({ config: sanitizeConfigForClient(config) });
          }
        }

        if (apiPath === '/generate' && request.method === 'POST') {
          const body = await readJson<{ hostname?: string }>(request);
          const host = requireHost(body.hostname);
          const config = await getSystemConfig(env);
          const result = await generateOnce(host, env, config, true);
          const updatedConfig = await getSystemConfig(env);
          return jsonResponse({
            result: { ...result, llmsTxt: undefined, llmsFullTxt: undefined },
            config: sanitizeConfigForClient(updatedConfig),
          });
        }

        if (apiPath === '/zones' && request.method === 'POST') {
          const body = await readJson<{ apiToken?: string }>(request);
          const config = await getSystemConfig(env);
          const token = typeof body.apiToken === 'string' ? body.apiToken.trim() : '';
          const zones = await listCloudflareZones(env, config, token || undefined);

          if (token && !token.includes('•')) {
            config.cfApiToken = token;
            await saveSystemConfig(env, config, config);
          }
          return jsonResponse({ zones, config: sanitizeConfigForClient(config) });
        }

        if (apiPath === '/scan-dns' && request.method === 'POST') {
          const body = await readJson<{
            apiToken?: string;
            selectedZoneIds?: unknown;
            bindRoutes?: boolean;
            workerName?: string;
          }>(request);
          const config = await getSystemConfig(env);
          const zoneIds = Array.isArray(body.selectedZoneIds)
            ? body.selectedZoneIds.filter((z): z is string => typeof z === 'string' && /^[a-f0-9]{32}$/i.test(z))
            : undefined;
          const workerName =
            typeof body.workerName === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/i.test(body.workerName)
              ? body.workerName
              : undefined;
          const scanRes = await scanCloudflareDnsSubdomains(env, config, {
            apiTokenOverride: typeof body.apiToken === 'string' ? body.apiToken : undefined,
            selectedZoneIds: zoneIds,
            bindRoutes: body.bindRoutes !== false,
            workerNameOverride: workerName,
          });
          return jsonResponse({ ...scanRes, config: sanitizeConfigForClient(config) });
        }

        if (apiPath === '/content') {
          const config = await getSystemConfig(env);
          if (request.method === 'GET') {
            const host = requireHost(url.searchParams.get('hostname'));
            const data = await getDomainLlmsTxt(env, host, url.searchParams.get('full') === '1');
            return jsonResponse({ content: data?.content || '', metadata: data?.metadata || null });
          }

          if (request.method === 'PUT') {
            const body = await readJson<{ hostname?: string; full?: boolean; content?: unknown }>(request);
            const host = requireHost(body.hostname);
            if (typeof body.content !== 'string') throw new HttpError(400, 'content 必須是字串');

            if (body.full) {
              const existingMain = await getDomainLlmsTxt(env, host, false);
              await saveDomainLlmsTxt(env, host, existingMain?.content || `# ${host}\n`, body.content);
            } else {
              await saveDomainLlmsTxt(env, host, body.content);
            }

            const entry = await ensureDomainEntry(env, config, host, 'manual');
            entry.status = 'cached';
            entry.lastUpdated = new Date().toISOString();
            await saveSystemConfig(env, config, config);
            return jsonResponse({ config: sanitizeConfigForClient(config) });
          }
        }

        return jsonResponse({ error: 'Unknown API endpoint' }, 404);
      } catch (err: any) {
        if (err instanceof HttpError) return jsonResponse({ error: err.message }, err.status);
        return jsonResponse({ error: err?.message || 'Internal Server Error' }, 500);
      }
    }

    return new Response('Not Found', { status: 404, headers: baseSecurityHeaders() });
  },
};
