import { Env } from './types';

const AUTH_KEY = '_system/auth.json';
const PBKDF2_ITERATIONS = 100_000; 
const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const SESSION_COOKIE = 'llmtxt_session';
export const MIN_PASSWORD_LENGTH = 8;

export interface AuthRecord {

  passwordHash: string;
  salt?: string;
  iterations?: number;

  sessionSecret?: string;
  createdAt: string;
}

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer | Uint8Array): string {
  return Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomHex(bytes: number): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(input)));
}

async function pbkdf2Hex(password: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(saltHex), iterations },
    key,
    256
  );
  return toHex(bits);
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

async function readAuthRecord(env: Env): Promise<AuthRecord | null> {
  const obj = await env.LLM_BUCKET.get(AUTH_KEY);
  if (!obj) return null;
  try {
    return await obj.json<AuthRecord>();
  } catch {
    return null;
  }
}

async function writeAuthRecord(env: Env, record: AuthRecord, createOnly = false): Promise<boolean> {
  const res = await env.LLM_BUCKET.put(AUTH_KEY, JSON.stringify(record), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    ...(createOnly ? { onlyIf: { etagDoesNotMatch: '*' } } : {}),
  } as any);

  return createOnly ? res !== null : true;
}

export async function getAuthStatus(env: Env): Promise<{
  requiresSetup: boolean;
  envProtected: boolean;
}> {
  if (env.ADMIN_TOKEN && env.ADMIN_TOKEN.trim().length > 0) {
    return { requiresSetup: false, envProtected: true };
  }
  const obj = await env.LLM_BUCKET.get(AUTH_KEY);
  return { requiresSetup: !obj, envProtected: false };
}

export async function setAdminPassword(env: Env, newPassword: string): Promise<boolean> {
  const salt = randomHex(16);
  const record: AuthRecord = {
    passwordHash: await pbkdf2Hex(newPassword.trim(), salt, PBKDF2_ITERATIONS),
    salt,
    iterations: PBKDF2_ITERATIONS,
    sessionSecret: randomHex(32),
    createdAt: new Date().toISOString(),
  };
  return writeAuthRecord(env, record, true);
}

export async function verifyPassword(env: Env, candidate: string): Promise<boolean> {
  if (!candidate) return false;
  if (env.ADMIN_TOKEN && env.ADMIN_TOKEN.trim().length > 0) {
    return timingSafeEqual(candidate, env.ADMIN_TOKEN.trim());
  }
  const record = await readAuthRecord(env);
  if (!record) return false;

  if (record.salt) {
    const digest = await pbkdf2Hex(candidate, record.salt, record.iterations || PBKDF2_ITERATIONS);
    return timingSafeEqual(digest, record.passwordHash);
  }

  const ok = await timingSafeEqual(await sha256Hex(candidate), record.passwordHash);
  if (ok) {
    const salt = randomHex(16);
    await writeAuthRecord(env, {
      passwordHash: await pbkdf2Hex(candidate, salt, PBKDF2_ITERATIONS),
      salt,
      iterations: PBKDF2_ITERATIONS,
      sessionSecret: randomHex(32),
      createdAt: record.createdAt,
    });
  }
  return ok;
}

async function getSessionSecret(env: Env): Promise<string | null> {
  if (env.ADMIN_TOKEN && env.ADMIN_TOKEN.trim().length > 0) {
    return sha256Hex(`llmtxt-session:${env.ADMIN_TOKEN.trim()}`);
  }
  const record = await readAuthRecord(env);
  return record?.sessionSecret || null;
}

export async function createSessionToken(env: Env): Promise<string | null> {
  const secret = await getSessionSecret(env);
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const sig = await hmacHex(secret, String(exp));
  return `${exp}.${sig}`;
}

async function verifySessionToken(env: Env, token: string): Promise<boolean> {
  const [expStr, sig] = token.split('.');
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const secret = await getSessionSecret(env);
  if (!secret) return false;
  return timingSafeEqual(await hmacHex(secret, String(exp)), sig);
}

function readCookie(request: Request, name: string): string {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return '';
}

export function buildSessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${
    secure ? '; Secure' : ''
  }`;
}

export function buildClearCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

export async function isAdminRequest(request: Request, env: Env): Promise<boolean> {
  const cookie = readCookie(request, SESSION_COOKIE);
  if (cookie && (await verifySessionToken(env, cookie))) {
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (!unsafe || request.headers.get('X-LLMTXT-CSRF') === '1') return true;
    return false;
  }
  const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) return verifyPassword(env, bearer);
  return false;
}

const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export function isLoginLocked(ip: string): boolean {
  const f = failures.get(ip);
  return Boolean(f && f.until > Date.now());
}

export function recordLoginFailure(ip: string): void {
  const f = failures.get(ip) || { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILURES) {
    f.until = Date.now() + LOCK_MS;
    f.count = 0;
  }
  failures.set(ip, f);
  if (failures.size > 5000) failures.clear();
}

export function clearLoginFailures(ip: string): void {
  failures.delete(ip);
}
