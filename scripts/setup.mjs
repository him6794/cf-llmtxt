import { execSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function runCmd(cmd, env = process.env, silent = false) {
  try {
    const out = execSync(cmd, {
      cwd: rootDir,
      env,
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf-8',
    });
    return { ok: true, output: out || '' };
  } catch (err) {
    return {
      ok: false,
      output: (err.stdout || '') + '\n' + (err.stderr || err.message || ''),
    };
  }
}

async function main() {
  const rl = readline.createInterface({ input, output });
  console.log('====================================================');
  console.log('  CF-LLMTXT 開源專案自動化安裝與部署精靈 (Setup CLI)');
  console.log('====================================================\n');

  console.log('[1/4] 檢查 Cloudflare Wrangler 登入狀態...');
  let whoami = runCmd('npx wrangler whoami', process.env, true);
  if (!whoami.ok || whoami.output.includes('You are not authenticated')) {
    console.log('尚未登入 Cloudflare，正在啟動瀏覽器登入...');
    runCmd('npx wrangler login');
    whoami = runCmd('npx wrangler whoami', process.env, true);
  }

  const accountMatches = [
    ...whoami.output.matchAll(/│\s*([^│\n]+?)\s*│\s*([a-f0-9]{32})\s*│/gi),
  ];
  let selectedAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';

  if (!selectedAccountId && accountMatches.length === 1) {
    selectedAccountId = accountMatches[0][2].trim();
    console.log(`已偵測到 Cloudflare 帳號: ${accountMatches[0][1].trim()} (${selectedAccountId})`);
  } else if (!selectedAccountId && accountMatches.length > 1) {
    console.log('\n偵測到多個 Cloudflare 帳號：');
    accountMatches.forEach((m, idx) => {
      console.log(`  [${idx + 1}] ${m[1].trim()} (${m[2].trim()})`);
    });
    const ans = await rl.question(`\n請輸入要部署的帳號編號 [預設 1]: `);
    const idx = Math.max(0, (parseInt(ans.trim() || '1', 10) || 1) - 1);
    selectedAccountId = (accountMatches[idx] || accountMatches[0])[2].trim();
  }

  const deployEnv = {
    ...process.env,
    ...(selectedAccountId ? { CLOUDFLARE_ACCOUNT_ID: selectedAccountId } : {}),
  };

  console.log('\n[2/4] 檢查與建立 R2 Bucket (llmtxt-storage)...');
  const createBucket = runCmd('npx wrangler r2 bucket create llmtxt-storage', deployEnv, true);
  if (createBucket.ok) {
    console.log('已建立 R2 Bucket: llmtxt-storage');
  } else if (createBucket.output.includes('already exists')) {
    console.log('R2 Bucket (llmtxt-storage) 已存在，直接沿用');
  } else {
    console.log('提示: R2 Bucket 建立略過或已存在');
  }

  console.log('\n[3/4] 網域路由掛載設定 (選填)');
  console.log('您可以現在輸入主網域由 Wrangler 自動掛載路由，或留空於部署後在 Web Dashboard 使用精靈一鍵設定。');
  const domainAns = await rl.question('請輸入要掛載的主網域 (多個請用逗號分隔，直接按 Enter 略過): ');
  const domains = domainAns
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);

  if (domains.length > 0) {
    const wranglerPath = path.join(rootDir, 'wrangler.toml');
    let toml = await fs.readFile(wranglerPath, 'utf-8');

    toml = toml.replace(/\nroutes\s*=\s*\[[\s\S]*?\]\n?/g, '\n');

    const entries = [];
    for (const d of domains) {
      entries.push(
        `  { pattern = "*${d}/llm.txt", zone_name = "${d}" }`,
        `  { pattern = "*${d}/llms.txt", zone_name = "${d}" }`,
        `  { pattern = "*${d}/llms-full.txt", zone_name = "${d}" }`
      );
    }
    const routesBlock = `workers_dev = true\n\nroutes = [\n${entries.join(',\n')}\n]`;
    toml = toml.replace(/workers_dev\s*=\s*true/, routesBlock);
    await fs.writeFile(wranglerPath, toml, 'utf-8');
    console.log(`已將 ${domains.join(', ')} 的 /llm.txt 與 /llms.txt 路由寫入 wrangler.toml`);
  }

  console.log('\n[4/4] 正在部署 CF-LLMTXT Worker 至 Cloudflare Edge...');
  runCmd('npx wrangler deploy', deployEnv, false);

  console.log('\n部署完成！請打開上方輸出的 workers.dev 網址並前往 /_llmtxt 設定管理員密碼與啟用子網域。');
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
