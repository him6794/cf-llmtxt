import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const r2Dir = path.join(rootDir, '.r2-local');
const distFile = path.join(rootDir, 'dist', 'index.js');

console.log('[Build] Building Cloudflare Worker bundle...');
execSync('npx wrangler deploy --dry-run --outdir dist', {
  cwd: rootDir,
  stdio: 'inherit',
});

const workerModule = await import(pathToFileURL(distFile).href);
const worker = workerModule.default;

class LocalR2Bucket {
  constructor(baseDir) {
    this.baseDir = baseDir;
  }

  _filePath(key) {
    const safeKey = key.replace(/\.\./g, '_');
    return path.join(this.baseDir, safeKey);
  }

  _metaPath(key) {
    return this._filePath(key) + '.__meta__.json';
  }

  async get(key) {
    const fp = this._filePath(key);
    try {
      const buf = await fs.readFile(fp);
      let customMetadata = {};
      try {
        const metaRaw = await fs.readFile(this._metaPath(key), 'utf-8');
        customMetadata = JSON.parse(metaRaw).customMetadata || {};
      } catch {

      }
      return {
        key,
        customMetadata,
        async text() {
          return buf.toString('utf-8');
        },
        async json() {
          return JSON.parse(buf.toString('utf-8'));
        },
        body: buf,
      };
    } catch {
      return null;
    }
  }

  async put(key, value, options = {}) {
    const fp = this._filePath(key);
    if (options.onlyIf && options.onlyIf.etagDoesNotMatch === '*') {
      try {
        await fs.access(fp);
        return null; 
      } catch {

      }
    }
    await fs.mkdir(path.dirname(fp), { recursive: true });
    const data = typeof value === 'string' ? Buffer.from(value, 'utf-8') : Buffer.from(value);
    await fs.writeFile(fp, data);
    if (options.customMetadata || options.httpMetadata) {
      await fs.writeFile(
        this._metaPath(key),
        JSON.stringify(
          {
            customMetadata: options.customMetadata || {},
            httpMetadata: options.httpMetadata || {},
          },
          null,
          2
        ),
        'utf-8'
      );
    }
    return { key };
  }

  async delete(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) {
      try {
        await fs.unlink(this._filePath(k));
      } catch {}
      try {
        await fs.unlink(this._metaPath(k));
      } catch {}
    }
  }
}

const env = {
  LLM_BUCKET: new LocalR2Bucket(r2Dir),
  DEFAULT_MODE: 'auto',
  ADMIN_PATH: '/_llmtxt',
};

const PORT = Number(process.env.PORT || 3456);
const HOST = process.env.HOST || '127.0.0.1';

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `localhost:${PORT}`;
    const fullUrl = `http://${host}${req.url || '/'}`;

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyBuf = Buffer.concat(chunks);

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) {
        headers.set(k, v.join(', '));
      } else if (typeof v === 'string') {
        headers.set(k, v);
      }
    }

    const cfReq = new Request(fullUrl, {
      method: req.method || 'GET',
      headers,
      body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : bodyBuf,
    });

    const ctx = {
      waitUntil(promise) {
        Promise.resolve(promise).catch((err) => console.error('waitUntil error:', err));
      },
      passThroughOnException() {},
    };

    const cfRes = await worker.fetch(cfReq, env, ctx);
    res.statusCode = cfRes.status;
    cfRes.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });
    const arrayBuf = await cfRes.arrayBuffer();
    res.end(Buffer.from(arrayBuf));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Internal Worker Error: ' + (err?.message || err));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n[Ready] CF-LLMTXT 本地開發伺服器已啟動`);
  console.log(`Dashboard 管理後台: http://${HOST}:${PORT}/_llmtxt`);
  console.log(`測試 /llm.txt 路由:  http://${HOST}:${PORT}/llm.txt?domain=example.com`);
  console.log(`測試 /llms.txt 路由: http://${HOST}:${PORT}/llms.txt?domain=example.com`);
  console.log(`本地 R2 儲存目錄:   ${r2Dir}\n`);
});
