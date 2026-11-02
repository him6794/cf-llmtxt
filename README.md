# cf-llmtxt

以 Cloudflare Worker、R2 與 Workers AI 實作的 `/llm.txt`、`/llms.txt`、`/llms-full.txt` 邊緣索引服務。可將整個主網域（Zone）與所有子網域的 `llm.txt` 流量統一交由單一 Worker 處理。

## 運作方式

1. **路由攔截与快取**：當訪客或 AI Agent 請求任何網域下的 `/llm.txt`、`/llms.txt` 或 `/llms-full.txt` 時，Worker 先查詢 R2（`domains/<hostname>/llms.txt`）。命中時直接從邊緣回傳。
2. **雙模式控制**：
   - **自動模式（`auto`）**：快取未命中時，現場爬取該網域並透過 Workers AI 產生摘要後存入 R2。
   - **手動模式（`manual`）**：僅處理後台已勾選啟用的子網域；未啟用的子網域直接回傳 404，不觸發爬蟲與 AI。
3. **SSR 與 SPA 雙引擎爬取**：
   - 靜態網頁與 SSR 網站使用 Cloudflare 原生 `HTMLRewriter` 串流解析 HTML 與 `/sitemap.xml`。
   - 針對 `<div id="root">` 等純前端 SPA（Vite、Create React App、Webpack），內建原生 JS Bundle 與同源 JSON API 深度提取器，亦可選配 Cloudflare Browser Rendering API 或 `r.jina.ai` 備援。
4. **定時自動更新（Cron）**：每小時（`0 * * * *`）檢查已過期的網域並重新爬取；透過內容 SHA-256（`contentHash`）比對，若網頁內容與 Prompt 皆未變動則直接沿用既有快取，不重跑 Workers AI。

---

## 部署流程

### 前置需求

- Node.js 18 以上
- Cloudflare 帳號（需在 Cloudflare Dashboard 啟用 **R2**）

### 方式一：互動式安裝腳本（推薦）

```bash
git clone https://github.com/him6794/cf-llmtxt.git
cd cf-llmtxt
npm install
npm run setup
```

`npm run setup` 會依序執行：
1. 檢查 `wrangler` 登入狀態（未登入時自動開啟瀏覽器授權），若有多個 Cloudflare 帳號會提示選擇。
2. 自動建立名為 `llmtxt-storage` 的 R2 Bucket（已存在則直接沿用）。
3. 詢問是否要在部署時直接將主網域路由寫入 `wrangler.toml`（可留空，改於部署後在網頁後台自動綁定）。
4. 執行 `npx wrangler deploy` 部署上線。

### 方式二：手動 Wrangler CLI 部署

```bash
npm install

npx wrangler login
npx wrangler r2 bucket create llmtxt-storage
npx wrangler deploy
```

若帳號下有多個 Account ID，可在執行前指定環境變數：

```powershell
$env:CLOUDFLARE_ACCOUNT_ID="你的_ACCOUNT_ID"
npx wrangler deploy
```

若想透過 `wrangler.toml` 靜態管理路由，可在 `workers_dev = true` 下方加入自己的網域：

```toml
routes = [
  { pattern = "*example.com/llm.txt", zone_name = "example.com" },
  { pattern = "*example.com/llms.txt", zone_name = "example.com" },
  { pattern = "*example.com/llms-full.txt", zone_name = "example.com" }
]
```

### 部署後初始化與自動綁定路由

1. **設定管理密碼**：
   - 部署完成後，立刻開啟 `https://cf-llmtxt.<你的子域>.workers.dev/_llmtxt` 設定管理密碼（至少 8 個字元，以 PBKDF2-SHA256 加鹽雜湊存於 R2 `_system/auth.json`）。
   - 在完成首次密碼設定前，除了設定密碼端點外，所有後台 API 一律回傳 `403`。
   - 也可以在 CLI 使用 Secret 設定密碼（優先於 R2 內的密碼）：
     ```bash
     npx wrangler secret put ADMIN_TOKEN
     ```
2. **自動綁定 Worker 路由與匯入 DNS 子網域**：
   - 登入後台後，點擊右上角「**綁定路由與掃描網域**」。
   - 點擊視窗內的「**前往 Cloudflare 建立 Token（自動帶入權限）**」連結，Cloudflare 會自動預填 `Zone:Read`、`DNS:Read`、`Workers Routes:Edit` 三項權限與所有網域範圍，按 Continue 產生 Token 後貼回後台。
   - 點擊「**讀取網域**」並勾選要納管的 Zone，再按「**綁定並匯入**」，系統會自動掛載 `*domain/llm.txt`、`*domain/llms.txt`、`*domain/llms-full.txt` 三條路由並匯入該網域下的 `A`、`AAAA`、`CNAME` 子網域。

---

## 開發須知

### 目錄與檔案結構

| 路徑 | 職責 |
| :--- | :--- |
| `src/index.ts` | Worker `fetch` 與 `scheduled`（Cron）入口、公開路由與 `/_llmtxt/api/*` 管理端點、同源與請求大小檢查、並發爬取合併（`inflight`） |
| `src/auth.ts` | PBKDF2-SHA256（100,000 次迭代）密碼雜湊、固定時間比對、HMAC-SHA256 簽章 Session Cookie、CSRF 檢查与登入失敗鎖定 |
| `src/crawler.ts` | `HTMLRewriter` 靜態/SSR 解析、原生 SPA Bundle 路由與同源 API 深度解析、單篇文章全文抓取、Sitemap 解析 |
| `src/ai.ts` | Workers AI 呼叫（預設 `@cf/meta/llama-3.3-70b-instruct-fp8-fast`）、英文零幻覺 Prompt 模板（`{{hostname}}`、`{{pages}}`）、`llms.txt` 與 `llms-full.txt` 組裝 |
| `src/storage.ts` | R2 讀寫封裝、設定檔白名單驗證（`sanitizeIncomingConfig`）、公开網域名稱驗證、Cloudflare Zones / DNS / Workers Routes API 串接 |
| `src/dashboard.ts` | 單檔零外部依賴的管理後台（`/_llmtxt`），支援深淺色主題、模式切換、Prompt 編輯、R2 內容檢視與編輯 |
| `src/types.ts` | TypeScript 介面與型別定義 |
| `scripts/dev-server.mjs` | 本機開發伺服器，先以 `wrangler deploy --dry-run` 打包後，在 Node.js 中搭配檔案系統模擬的 `LocalR2Bucket`（`.r2-local/`）執行 |
| `scripts/smoke-test.mjs` | 端到端功能與資安測試套件（79 項檢查） |
| `scripts/setup.mjs` | CLI 互動式安裝與部署腳本 |

### 本機開發

```bash
npm install
npm run dev
```

- 預設監聽 `http://127.0.0.1:3456`（避開 Windows Hyper-V 常保留的 `8787` 埠號），可用 `PORT` 與 `HOST` 環境變數覆寫。
- 本機 R2 物件與 metadata 會存放在專案根目錄下的 `.r2-local/`（已列入 `.gitignore`）。
- 本機環境沒有綁定雲端 `env.AI`，若未設定 `cfAccountId` 與 `cfApiToken`，摘要會自動退回規則式結構化摘要，方便離線驗證爬蟲結果。

### 型別檢查與測試

每次修改程式碼後，請確認通過型別檢查與自動化測試：

```bash
npm run typecheck
npm test
```

`npm test` 會在 `127.0.0.1:3466` 啟動獨立的測試伺服器與乾淨的 `.r2-local`，自動驗證：
- Dashboard CSP、`X-Frame-Options`、`X-Content-Type-Options` 與內嵌 Script 語法
- 首次設定前的 API 封鎖與原子寫入（防止並發搶註密碼）
- PBKDF2 雜湊儲存、舊版 SHA-256 密碼自動升級、Session Cookie 簽章與過期驗證
- CSRF Header（`X-LLMTXT-CSRF: 1`）與跨來源（`Origin`）攔截
- 網域名稱白名單驗證（阻擋 IP、`localhost`、內網後綴、R2 路徑穿越與 XSS 字元）
- 設定檔白名單過濾、API Token 遮罩與驗證後才持久化
- 無法連線的網站回傳錯誤且不寫入假快取、`contentHash` 記錄與登入暴力破解鎖定

### 管理 API 與認證機制

後台 API 位於 `/_llmtxt/api/*`，支援兩種認證方式：

1. **瀏覽器 Session**：呼叫 `POST /_llmtxt/api/auth-login` 取得 `HttpOnly; SameSite=Strict` 的 `llmtxt_session` Cookie；所有非 `GET`/`HEAD` 的修改請求必須帶上 `X-LLMTXT-CSRF: 1` 標頭。
2. **腳本 / CI Bearer Token**：在請求標頭帶上 `Authorization: Bearer <管理密碼或 ADMIN_TOKEN>`。

常用管理操作（以 `curl` 為例）：

```bash
curl -H "Authorization: Bearer <密碼>" \
  "https://你的網域/llms.txt?domain=example.com&refresh=1"

curl -X POST -H "Authorization: Bearer <密碼>" \
  -H "Content-Type: application/json" \
  -d '{"hostname":"blog.example.com"}' \
  "https://你的網域/_llmtxt/api/generate"
```

> 注意：`?domain=` 與 `?refresh=1` 參數會觸發外部爬取與 AI 額度消耗，因此僅限通過認證的管理員使用；一般訪客直接透過綁定好的網域訪問 `https://blog.example.com/llms.txt` 則為公開存取。

### R2 儲存結構與環境變數

**R2 物件路徑（Bucket：`llmtxt-storage`）**
- `_system/auth.json`：管理密碼的 PBKDF2 雜湊、Salt 與 Session 簽章金鑰
- `_system/config.json`：系統設定、已綁定 Zones 與納管子網域狀態
- `domains/<hostname>/llms.txt`：該網域的標準導覽索引
- `domains/<hostname>/llms-full.txt`：該網域所有頁面的完整 Markdown 內容

**環境變數與 Secrets**
- `DEFAULT_MODE`：預設索引模式（`auto` 或 `manual`，定義於 `wrangler.toml`）
- `ADMIN_PATH`：後台路徑（預設 `/_llmtxt`）
- `ADMIN_TOKEN`（Secret，選填）：若透過 `wrangler secret put ADMIN_TOKEN` 設定，將優先作為後台管理密碼
- `CF_API_TOKEN` / `CF_ACCOUNT_ID` / `CF_ZONE_ID`（Secret，選填）：可透過環境變數提供，或直接在後台「設定」頁面儲存於私有 R2
