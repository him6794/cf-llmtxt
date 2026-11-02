import { DEFAULT_AI_PROMPT } from './ai';

export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-Hant" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>cf-llmtxt</title>
  <style>
    :root {
      --background: oklch(1 0 0);
      --foreground: oklch(0.145 0 0);
      --card: oklch(1 0 0);
      --card-foreground: oklch(0.145 0 0);
      --popover: oklch(1 0 0);
      --popover-foreground: oklch(0.145 0 0);
      --primary: oklch(0.205 0 0);
      --primary-foreground: oklch(0.985 0 0);
      --secondary: oklch(0.97 0 0);
      --secondary-foreground: oklch(0.205 0 0);
      --muted: oklch(0.97 0 0);
      --muted-foreground: oklch(0.556 0 0);
      --accent: oklch(0.97 0 0);
      --accent-foreground: oklch(0.205 0 0);
      --destructive: oklch(0.577 0.245 27.325);
      --border: oklch(0.922 0 0);
      --input: oklch(0.922 0 0);
      --ring: oklch(0.708 0 0);
      --chart-1: oklch(0.87 0 0);
      --chart-2: oklch(0.556 0 0);
      --chart-3: oklch(0.439 0 0);
      --chart-4: oklch(0.371 0 0);
      --chart-5: oklch(0.269 0 0);
      --radius: 0.625rem;
      --sidebar: oklch(0.985 0 0);
      --sidebar-foreground: oklch(0.145 0 0);
      --sidebar-primary: oklch(0.205 0 0);
      --sidebar-primary-foreground: oklch(0.985 0 0);
      --sidebar-accent: oklch(0.97 0 0);
      --sidebar-accent-foreground: oklch(0.205 0 0);
      --sidebar-border: oklch(0.922 0 0);
      --sidebar-ring: oklch(0.708 0 0);
    }

    .dark {
      --background: oklch(0.145 0 0);
      --foreground: oklch(0.985 0 0);
      --card: oklch(0.205 0 0);
      --card-foreground: oklch(0.985 0 0);
      --popover: oklch(0.205 0 0);
      --popover-foreground: oklch(0.985 0 0);
      --primary: oklch(0.922 0 0);
      --primary-foreground: oklch(0.205 0 0);
      --secondary: oklch(0.269 0 0);
      --secondary-foreground: oklch(0.985 0 0);
      --muted: oklch(0.269 0 0);
      --muted-foreground: oklch(0.708 0 0);
      --accent: oklch(0.269 0 0);
      --accent-foreground: oklch(0.985 0 0);
      --destructive: oklch(0.704 0.191 22.216);
      --border: oklch(1 0 0 / 10%);
      --input: oklch(1 0 0 / 15%);
      --ring: oklch(0.556 0 0);
      --chart-1: oklch(0.87 0 0);
      --chart-2: oklch(0.556 0 0);
      --chart-3: oklch(0.439 0 0);
      --chart-4: oklch(0.371 0 0);
      --chart-5: oklch(0.269 0 0);
      --sidebar: oklch(0.205 0 0);
      --sidebar-foreground: oklch(0.985 0 0);
      --sidebar-primary: oklch(0.488 0.243 264.376);
      --sidebar-primary-foreground: oklch(0.985 0 0);
      --sidebar-accent: oklch(0.269 0 0);
      --sidebar-accent-foreground: oklch(0.985 0 0);
      --sidebar-border: oklch(1 0 0 / 10%);
      --sidebar-ring: oklch(0.556 0 0);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
      background-color: var(--background);
      color: var(--foreground);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      transition: background-color 0.15s ease, color 0.15s ease;
    }

    .app-shell {
      display: grid;
      grid-template-columns: 250px 1fr;
      min-height: 100vh;
    }

    @media (max-width: 860px) {
      .app-shell {
        grid-template-columns: 1fr;
      }
      .sidebar {
        border-right: none !important;
        border-bottom: 1px solid var(--sidebar-border);
      }
    }

    .sidebar {
      background-color: var(--sidebar);
      color: var(--sidebar-foreground);
      border-right: 1px solid var(--sidebar-border);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .brand {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--sidebar-border);
    }

    .brand-title {
      font-weight: 700;
      font-size: 1.05rem;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .nav-list {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .nav-btn {
      width: 100%;
      text-align: left;
      padding: 0.6rem 0.75rem;
      border-radius: calc(var(--radius) - 2px);
      border: 1px solid transparent;
      background: transparent;
      color: var(--sidebar-foreground);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.12s ease;
    }

    .nav-btn:hover {
      background: var(--sidebar-accent);
      color: var(--sidebar-accent-foreground);
    }

    .nav-btn.active {
      background: var(--primary);
      color: var(--primary-foreground);
    }

    .sidebar-footer {
      margin-top: auto;
      padding-top: 1rem;
      border-top: 1px solid var(--sidebar-border);
      font-size: 0.75rem;
      color: var(--muted-foreground);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .main {
      padding: 1.75rem 2rem;
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .topbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .page-heading h1 {
      font-size: 1.4rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .page-heading p {
      font-size: 0.85rem;
      color: var(--muted-foreground);
      margin-top: 0.2rem;
    }

    .actions-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      padding: 0.5rem 0.9rem;
      font-size: 0.825rem;
      font-weight: 500;
      border-radius: calc(var(--radius) - 2px);
      border: 1px solid var(--border);
      background-color: var(--secondary);
      color: var(--secondary-foreground);
      cursor: pointer;
      transition: opacity 0.15s ease, background-color 0.15s ease;
      text-decoration: none;
      white-space: nowrap;
    }

    .btn:hover:not(:disabled) {
      opacity: 0.9;
      background-color: var(--accent);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background-color: var(--primary);
      color: var(--primary-foreground);
      border-color: var(--primary);
    }

    .btn-primary:hover:not(:disabled) {
      background-color: var(--primary);
      opacity: 0.88;
    }

    .btn-sm {
      padding: 0.32rem 0.65rem;
      font-size: 0.775rem;
    }

    .card {
      background-color: var(--card);
      color: var(--card-foreground);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .mode-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
    }

    .mode-option {
      border: 1px solid var(--border);
      background-color: var(--card);
      border-radius: var(--radius);
      padding: 1.1rem;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      transition: border-color 0.15s ease, background-color 0.15s ease;
    }

    .mode-option:hover {
      background-color: var(--accent);
    }

    .mode-option.selected {
      border: 2px solid var(--primary);
      background-color: var(--secondary);
    }

    .mode-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
      font-size: 0.95rem;
    }

    .mode-desc {
      font-size: 0.82rem;
      color: var(--muted-foreground);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.18rem 0.55rem;
      font-size: 0.72rem;
      font-weight: 600;
      border-radius: 999px;
      border: 1px solid var(--border);
      background-color: var(--muted);
      color: var(--foreground);
    }

    .badge-active {
      background-color: var(--primary);
      color: var(--primary-foreground);
      border-color: var(--primary);
    }

    .input, .select, .textarea {
      background-color: var(--background);
      color: var(--foreground);
      border: 1px solid var(--input);
      border-radius: calc(var(--radius) - 2px);
      padding: 0.5rem 0.75rem;
      font-size: 0.85rem;
      outline: none;
      width: 100%;
    }

    .input:focus, .select:focus, .textarea:focus {
      border-color: var(--ring);
      box-shadow: 0 0 0 2px var(--ring);
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      align-items: center;
      justify-content: space-between;
    }

    .add-bar {
      display: flex;
      gap: 0.5rem;
      flex: 1;
      min-width: 280px;
    }

    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) - 2px);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }

    th, td {
      padding: 0.75rem 0.9rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    th {
      background-color: var(--muted);
      color: var(--muted-foreground);
      font-weight: 600;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background-color: var(--accent);
    }

    .domain-cell {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .domain-links {
      display: flex;
      gap: 0.6rem;
      font-size: 0.75rem;
    }

    .domain-links a {
      color: var(--muted-foreground);
      text-decoration: underline;
    }

    .domain-links a:hover {
      color: var(--foreground);
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.85rem;
    }

    .stat-box {
      padding: 0.95rem 1.1rem;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      background-color: var(--card);
    }

    .stat-label {
      font-size: 0.76rem;
      color: var(--muted-foreground);
    }

    .stat-value {
      font-size: 1.35rem;
      font-weight: 700;
      margin-top: 0.2rem;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: oklch(0 0 0 / 60%);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
      z-index: 50;
    }

    .modal-backdrop.open {
      display: flex;
    }

    .modal {
      background-color: var(--popover);
      color: var(--popover-foreground);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      max-width: 760px;
      width: 100%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .modal-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
    }

    .modal-body {
      padding: 1.25rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .modal-footer {
      padding: 0.9rem 1.25rem;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .field label {
      font-size: 0.8rem;
      font-weight: 600;
    }

    .field span.hint {
      font-size: 0.74rem;
      color: var(--muted-foreground);
    }

    .zone-list {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      max-height: 220px;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) - 2px);
      padding: 0.65rem;
      background-color: var(--background);
    }

    .zone-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.45rem 0.6rem;
      border-radius: calc(var(--radius) - 4px);
      border: 1px solid var(--border);
      background-color: var(--card);
      font-size: 0.84rem;
    }

    .auth-screen {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .auth-card {
      max-width: 420px;
      width: 100%;
    }

    .toast {
      position: fixed;
      bottom: 1.25rem;
      right: 1.25rem;
      background-color: var(--primary);
      color: var(--primary-foreground);
      padding: 0.7rem 1rem;
      border-radius: calc(var(--radius) - 2px);
      font-size: 0.84rem;
      font-weight: 500;
      display: none;
      z-index: 100;
    }

    .hidden {
      display: none !important;
    }

    .checkbox {
      width: 16px;
      height: 16px;
      accent-color: var(--primary);
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="authScreen" class="auth-screen hidden">
    <div class="card auth-card">
      <div class="brand" style="border-bottom:none;padding-bottom:0;">
        <div class="brand-title">
          <span>cf-llmtxt</span>
        </div>
      </div>
      <h2 id="authTitle" style="font-size:1.1rem;font-weight:600;">設定密碼</h2>
      <p id="authDesc" style="font-size:0.83rem;color:var(--muted-foreground);">
        第一次使用，請先設定管理密碼（至少 8 個字元）。
      </p>
      <div class="field">
        <label for="authPasswordInput">密碼</label>
        <input type="password" id="authPasswordInput" class="input" placeholder="至少 8 個字元" autocomplete="current-password" />
      </div>
      <button class="btn btn-primary" id="authSubmitBtn" style="width:100%;">進入</button>
    </div>
  </div>

  <div id="appShell" class="app-shell hidden">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-title">
          <span>cf-llmtxt</span>
        </div>
        <button class="btn btn-sm" id="themeToggleBtn" title="切換深淺主題">深淺色</button>
      </div>

      <nav class="nav-list">
        <button class="nav-btn active" data-tab="domains">
          <span>網域</span>
          <span class="badge" id="navCountBadge">0</span>
        </button>
        <button class="nav-btn" data-tab="settings">
          <span>設定</span>
        </button>
        <button class="nav-btn" data-tab="configjson">
          <span>設定檔 JSON</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <div>攔截 <code>/llm.txt</code> <code>/llms.txt</code> <code>/llms-full.txt</code></div>
        <button class="btn btn-sm" onclick="logoutAdmin()" style="margin-top:0.4rem;">登出</button>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="page-heading">
          <h1>llms.txt</h1>
          <p>爬取網站、用 Workers AI 整理後存進 R2，再由 Worker 回應。</p>
        </div>
        <div class="actions-row">
          <button class="btn" onclick="openWizardModal()">綁定路由與掃描網域</button>
          <button class="btn btn-primary" id="batchGenerateBtn">重新產生全部</button>
        </div>
      </header>

      <section class="stats-row">
        <div class="stat-box">
          <div class="stat-label">模式</div>
          <div class="stat-value" id="statMode">自動模式</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Zones</div>
          <div class="stat-value" id="statZonesCount">0</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">網域</div>
          <div class="stat-value" id="statTotalDomains">0</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">已快取</div>
          <div class="stat-value" id="statCachedDomains">0</div>
        </div>
      </section>

      <div id="tab-domains" class="tab-panel" style="display:flex;flex-direction:column;gap:1.25rem;">
        <section class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <h2 style="font-size:1rem;font-weight:600;">模式</h2>
            <span class="badge badge-active" id="currentModeBadge">AUTO</span>
          </div>
          <div class="mode-grid">
            <div class="mode-option" id="modeCardAuto" onclick="setIndexingMode('auto')">
              <div class="mode-header">
                <span>自動</span>
              </div>
              <p class="mode-desc">
                有人請求 llms.txt 而 R2 沒有快取時，才現場爬取並產生。
              </p>
            </div>

            <div class="mode-option" id="modeCardManual" onclick="setIndexingMode('manual')">
              <div class="mode-header">
                <span>手動</span>
              </div>
              <p class="mode-desc">
                只處理下方有勾選的網域，其餘一律回 404，不會觸發爬蟲。
              </p>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="toolbar">
            <div class="add-bar">
              <input
                type="text"
                id="newDomainInput"
                class="input"
                placeholder="blog.example.com"
              />
              <select id="newDomainRenderMode" class="select" style="max-width:190px;">
                <option value="auto">自動</option>
                <option value="ssr">靜態 HTML</option>
                <option value="spa">SPA</option>
              </select>
              <button class="btn btn-primary" id="addDomainBtn">新增</button>
            </div>
            <div style="display:flex;gap:0.4rem;">
              <button class="btn btn-sm" onclick="toggleSelectAll(true)">全選</button>
              <button class="btn btn-sm" onclick="toggleSelectAll(false)">全不選</button>
              <button class="btn btn-sm" onclick="loadConfig()">重新載入</button>
            </div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style="width:42px;">啟用</th>
                  <th>網域</th>
                  <th>渲染</th>
                  <th>狀態</th>
                  <th>內容</th>
                  <th>更新時間</th>
                  <th style="text-align:right;">操作</th>
                </tr>
              </thead>
              <tbody id="domainsTableBody">
                <tr>
                  <td colspan="7" style="text-align:center;color:var(--muted-foreground);padding:2rem;">
                    載入中
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div id="tab-settings" class="tab-panel hidden">
        <section class="card">
          <h2 style="font-size:1.05rem;font-weight:600;">設定</h2>
          <div class="form-grid">
            <div class="field">
              <label>預設渲染</label>
              <select id="settingDefaultRenderMode" class="select">
                <option value="auto">自動（偵測到空殼 SPA 才改用 SPA 流程）</option>
                <option value="ssr">只解析 HTML</option>
                <option value="spa">一律走 SPA 流程</option>
              </select>

            </div>

            <div class="field">
              <label>每個網域最多頁數</label>
              <input type="number" id="settingMaxPages" class="input" min="1" max="40" value="25" />
              <span class="hint">頁數越多，產生越久；Worker 每次請求的子請求數有上限。</span>
            </div>

            <div class="field">
              <label>自動更新間隔（小時）</label>
              <input type="number" id="settingRefreshHours" class="input" min="0" max="720" value="24" />
              <span class="hint">每小時檢查一次，快取超過這個時間的網域會重新爬取；內容沒變就不重跑 AI。0 為關閉。</span>
            </div>

            <div class="field">
              <label>摘要模型</label>
              <input type="text" id="settingAiModel" class="input" value="@cf/meta/llama-3.3-70b-instruct-fp8-fast" />

            </div>

            <div class="field">
              <label>SPA 備援（r.jina.ai）</label>
              <select id="settingSpaFallback" class="select">
                <option value="true">啟用</option>
                <option value="false">停用</option>
              </select>
              <span class="hint">會把網址送到第三方服務，不想外送就停用。</span>
            </div>

            <div class="field">
              <label>Zone ID（選填）</label>
              <input type="text" id="settingZoneId" class="input" placeholder="留空則使用 Token 可見的全部 Zone" />

            </div>

            <div class="field">
              <label>Account ID（選填）</label>
              <input type="text" id="settingAccountId" class="input" placeholder="Browser Rendering 用" />
            </div>

            <div class="field" style="grid-column: 1 / -1;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <label>Cloudflare API Token（需要 Zone:Read、DNS:Read、Workers Routes:Edit）</label>
                <a href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22zone%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22dns%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_routes%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=*&zoneId=all&name=cf-llmtxt" target="_blank" rel="noopener" style="font-size:0.76rem;color:var(--foreground);text-decoration:underline;">
                  前往 Cloudflare 建立 Token（已預填權限）
                </a>
              </div>
              <input type="password" id="settingApiToken" class="input" placeholder="已儲存的 Token 會以遮罩顯示" />
            </div>

            <div class="field" style="grid-column: 1 / -1;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <label for="settingAiPrompt">AI 摘要 Prompt</label>
                <button type="button" class="btn btn-sm" onclick="resetDefaultPrompt()">還原預設</button>
              </div>
              <textarea id="settingAiPrompt" class="textarea" rows="12" style="font-family:monospace;font-size:0.8rem;"></textarea>
              <span class="hint">可用變數：<code>{{hostname}}</code>（網域名稱）、<code>{{pages}}</code>（爬取內容）。若省略 <code>{{pages}}</code> 或 JSON 格式說明，系統會自動補在結尾。</span>
            </div>
          </div>

          <div style="display:flex;justify-content:flex-end;margin-top:0.5rem;">
            <button class="btn btn-primary" onclick="saveSettingsForm()">儲存</button>
          </div>
        </section>
      </div>

      <div id="tab-configjson" class="tab-panel hidden">
        <section class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <h2 style="font-size:1.05rem;font-weight:600;"><code>_system/config.json</code></h2>
              <p style="font-size:0.8rem;color:var(--muted-foreground);">送出前會由伺服器驗證，不合法的網域與欄位會被丟棄。</p>
            </div>
            <button class="btn btn-primary" onclick="saveRawConfigJson()">套用</button>
          </div>
          <textarea id="rawConfigTextarea" class="textarea" rows="20" style="font-family:monospace;font-size:0.82rem;"></textarea>
        </section>
      </div>
    </main>
  </div>

  <div class="modal-backdrop" id="wizardModal">
    <div class="modal">
      <div class="modal-header">
        <span>綁定路由與掃描網域</span>
        <button class="btn btn-sm" onclick="closeWizardModal()">關閉</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <label>API Token</label>
            <a href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22zone%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22dns%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_routes%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=*&zoneId=all&name=cf-llmtxt" target="_blank" rel="noopener" style="font-size:0.76rem;color:var(--foreground);text-decoration:underline;">
              前往 Cloudflare 建立 Token（自動帶入權限）
            </a>
          </div>
          <span class="hint">
            點擊右上方連結會自動幫你勾好 <code>Zone:Read</code>、<code>DNS:Read</code>、<code>Workers Routes:Edit</code> 權限與所有網域範圍，直接按 Continue 即可產生。
          </span>
          <div style="display:flex;gap:0.5rem;margin-top:0.25rem;">
            <input type="password" id="wizardTokenInput" class="input" placeholder="已儲存過可留空" />
            <button class="btn btn-primary" id="wizardFetchZonesBtn" onclick="fetchZonesInWizard()">讀取網域</button>
          </div>
        </div>

        <div class="field">
          <label>選擇 Zone</label>
          <div id="wizardZonesContainer" class="zone-list">
            <div style="color:var(--muted-foreground);font-size:0.82rem;text-align:center;padding:1rem;">
              先按「讀取網域」。
            </div>
          </div>
        </div>

        <div class="field" style="flex-direction:row;align-items:center;gap:0.5rem;">
          <input type="checkbox" id="wizardBindRoutesCheck" class="checkbox" checked />
          <label for="wizardBindRoutesCheck" style="font-weight:500;cursor:pointer;">
            為選取的 Zone 建立 Worker 路由（<code>llm.txt</code>、<code>llms.txt</code>、<code>llms-full.txt</code>）
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeWizardModal()">取消</button>
        <button class="btn btn-primary" id="wizardRunBtn" onclick="runWizardProvision()">綁定並匯入</button>
      </div>
    </div>
  </div>

  <div class="modal-backdrop" id="previewModal">
    <div class="modal">
      <div class="modal-header">
        <span id="previewModalTitle">llms.txt</span>
        <button class="btn btn-sm" onclick="closePreviewModal()">關閉</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;gap:0.5rem;align-items:center;justify-content:space-between;">
          <div style="display:flex;gap:0.4rem;">
            <button class="btn btn-sm btn-primary" id="btnSwitchLlms" onclick="switchPreviewType(false)">llms.txt</button>
            <button class="btn btn-sm" id="btnSwitchFull" onclick="switchPreviewType(true)">llms-full.txt</button>
          </div>
          <a id="previewDirectLink" href="#" target="_blank" class="btn btn-sm">另開分頁</a>
        </div>
        <textarea id="previewTextarea" class="textarea" rows="16" style="font-family:monospace;font-size:0.82rem;"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closePreviewModal()">取消</button>
        <button class="btn btn-primary" onclick="saveEditedLlmsTxt()">寫入 R2</button>
      </div>
    </div>
  </div>

  <div class="toast" id="toastBox"></div>

  <script>
    let currentConfig = null;
    let activePreviewHost = '';
    let activePreviewFull = false;
    let discoveredZones = [];
    const DEFAULT_PROMPT_TEXT = ${JSON.stringify(DEFAULT_AI_PROMPT)};
    async function logoutAdmin() {
      try {
        await fetch('/_llmtxt/api/auth-logout', {
          method: 'POST',
          headers: { 'X-LLMTXT-CSRF': '1' },
        });
      } catch (e) {}
      checkAuthAndInit();
    }
    function showToast(msg) {
      const el = document.getElementById('toastBox');
      el.textContent = msg;
      el.style.display = 'block';
      clearTimeout(window._toastTimer);
      window._toastTimer = setTimeout(() => {
        el.style.display = 'none';
      }, 3600);
    }

    document.getElementById('themeToggleBtn').addEventListener('click', () => {
      document.documentElement.classList.toggle('dark');
    });

    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
        document.getElementById('tab-' + tab).classList.remove('hidden');
      });
    });

    async function apiCall(path, options = {}) {
      const headers = {
        'Content-Type': 'application/json',
        'X-LLMTXT-CSRF': '1',
        ...(options.headers || {}),
      };
      const res = await fetch('/_llmtxt/api' + path, {
        ...options,
        headers,
      });
      let data = {};
      try { data = await res.json(); } catch (e) { data = { error: 'HTTP ' + res.status }; }
      if (res.status === 401 && data.unauthorized) {
        showAuthScreen(false);
        throw new Error('登入已過期，請重新登入');
      }
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Request failed');
      }
      return data;
    }

    function showAuthScreen(isSetup) {
      document.getElementById('appShell').classList.add('hidden');
      document.getElementById('authScreen').classList.remove('hidden');
      document.getElementById('authTitle').textContent = isSetup
        ? '設定密碼'
        : '登入';
      document.getElementById('authDesc').textContent = isSetup
        ? '第一次使用，請先設定管理密碼（至少 8 個字元）。'
        : '輸入管理密碼。';
      const btn = document.getElementById('authSubmitBtn');
      btn.onclick = async () => {
        const pwd = document.getElementById('authPasswordInput').value.trim();
        if (!pwd) return showToast('請輸入密碼');
        try {
          const endpoint = isSetup ? '/auth-setup' : '/auth-login';
          await apiCall(endpoint, {
            method: 'POST',
            body: JSON.stringify({ password: pwd }),
          });
          document.getElementById('authPasswordInput').value = '';
          document.getElementById('authScreen').classList.add('hidden');
          document.getElementById('appShell').classList.remove('hidden');
          await loadConfig();
        } catch (err) {
          showToast(err.message);
        }
      };
    }

    async function checkAuthAndInit() {
      try {
        const status = await apiCall('/auth-status');
        if (status.requiresSetup) {
          showAuthScreen(true);
        } else if (!status.authenticated) {
          showAuthScreen(false);
        } else {
          document.getElementById('authScreen').classList.add('hidden');
          document.getElementById('appShell').classList.remove('hidden');
          await loadConfig();
        }
      } catch (err) {
        showAuthScreen(false);
      }
    }

    async function loadConfig() {
      try {
        const data = await apiCall('/config');
        currentConfig = data.config;
        renderUI();
      } catch (err) {
        showToast('載入失敗: ' + err.message);
      }
    }

    function renderUI() {
      if (!currentConfig) return;
      const isAuto = currentConfig.mode === 'auto';
      document.getElementById('statMode').textContent = isAuto ? '自動' : '手動';
      document.getElementById('currentModeBadge').textContent = isAuto ? 'AUTO MODE' : 'MANUAL MODE';
      document.getElementById('modeCardAuto').classList.toggle('selected', isAuto);
      document.getElementById('modeCardManual').classList.toggle('selected', !isAuto);

      const domains = Object.values(currentConfig.domains || {});
      const cachedCount = domains.filter((d) => d.status === 'cached').length;
      const zonesCount = Array.isArray(currentConfig.zones) ? currentConfig.zones.length : 0;
      document.getElementById('statZonesCount').textContent = String(zonesCount);
      document.getElementById('statTotalDomains').textContent = String(domains.length);
      document.getElementById('statCachedDomains').textContent = String(cachedCount);
      document.getElementById('navCountBadge').textContent = String(domains.length);

      document.getElementById('settingDefaultRenderMode').value = currentConfig.defaultRenderMode || 'auto';
      document.getElementById('settingMaxPages').value = currentConfig.maxPagesPerDomain || 25;
      document.getElementById('settingRefreshHours').value = currentConfig.autoRefreshHours ?? 24;
      document.getElementById('settingAiModel').value = currentConfig.aiModel || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
      document.getElementById('settingSpaFallback').value = String(currentConfig.enableSpaFallback !== false);
      document.getElementById('settingZoneId').value = currentConfig.cfZoneId || '';
      document.getElementById('settingAccountId').value = currentConfig.cfAccountId || '';
      document.getElementById('settingApiToken').value = currentConfig.cfApiToken || '';
      document.getElementById('settingAiPrompt').value = currentConfig.aiPrompt || DEFAULT_PROMPT_TEXT;
      document.getElementById('rawConfigTextarea').value = JSON.stringify(currentConfig, null, 2);

      const tbody = document.getElementById('domainsTableBody');
      if (domains.length === 0) {
        tbody.innerHTML = \`
          <tr>
            <td colspan="7" style="text-align:center;color:var(--muted-foreground);padding:2.2rem;">
              還沒有網域。可用右上角的「綁定路由與掃描網域」匯入，或在上方手動新增。
            </td>
          </tr>\`;
        return;
      }

      tbody.innerHTML = domains
        .sort((a, b) => a.hostname.localeCompare(b.hostname))
        .map((d) => {
          const statusBadge =
            d.status === 'cached'
              ? '<span class="badge badge-active">已快取</span>'
              : d.status === 'generating'
              ? '<span class="badge">產生中</span>'
              : d.status === 'error'
              ? \`<span class="badge" title="\${escapeHtml(d.lastError || '')}">錯誤</span>\`
              : '<span class="badge">未建立</span>';

          const engineInfo =
            d.status === 'cached'
              ? \`\${d.pageCount || 1} 頁 · \${d.detectedSpa ? 'SPA' : 'SSR'} · \${d.usedAI ? 'AI' : '規則摘要'}\`
              : '-';

          const updatedTime = d.lastUpdated ? new Date(d.lastUpdated).toLocaleString('zh-TW') : '-';

          return \`
            <tr>
              <td>
                <input
                  type="checkbox"
                  class="checkbox"
                  \${d.enabled ? 'checked' : ''}
                  data-host="\${escapeHtml(d.hostname)}" onchange="toggleDomainEnabled(this.dataset.host, this.checked)"
                />
              </td>
              <td>
                <div class="domain-cell">
                  <strong>\${escapeHtml(d.hostname)}</strong>
                  <div class="domain-links">
                    <a href="https://\${escapeHtml(d.hostname)}/llm.txt" target="_blank">https://\${escapeHtml(d.hostname)}/llm.txt</a>
                    <a href="https://\${escapeHtml(d.hostname)}/llms.txt" target="_blank">/llms.txt</a>
                    <a href="https://\${escapeHtml(d.hostname)}/llms-full.txt" target="_blank">/llms-full.txt</a>
                  </div>
                </div>
              </td>
              <td>
                <select
                  class="select"
                  style="padding:0.28rem 0.5rem;font-size:0.78rem;max-width:145px;"
                  data-host="\${escapeHtml(d.hostname)}" onchange="changeDomainRenderMode(this.dataset.host, this.value)"
                >
                  <option value="auto" \${d.renderMode === 'auto' ? 'selected' : ''}>自動</option>
                  <option value="ssr" \${d.renderMode === 'ssr' ? 'selected' : ''}>僅 SSR</option>
                  <option value="spa" \${d.renderMode === 'spa' ? 'selected' : ''}>強制 SPA</option>
                </select>
              </td>
              <td>\${statusBadge}</td>
              <td style="font-size:0.78rem;color:var(--muted-foreground);">\${engineInfo}</td>
              <td style="font-size:0.78rem;color:var(--muted-foreground);">\${updatedTime}</td>
              <td style="text-align:right;">
                <div style="display:inline-flex;gap:0.35rem;flex-wrap:wrap;justify-content:flex-end;">
                  <button class="btn btn-sm btn-primary" data-host="\${escapeHtml(d.hostname)}" onclick="generateDomain(this.dataset.host, this)">
                    產生
                  </button>
                  <button class="btn btn-sm" data-host="\${escapeHtml(d.hostname)}" onclick="openPreviewModal(this.dataset.host)">
                    檢視
                  </button>
                  <button class="btn btn-sm" data-host="\${escapeHtml(d.hostname)}" onclick="if (confirm('刪除 ' + this.dataset.host + ' 與其快取？')) removeDomain(this.dataset.host)">
                    刪除
                  </button>
                </div>
              </td>
            </tr>
          \`;
        })
        .join('');
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function openWizardModal() {
      document.getElementById('wizardModal').classList.add('open');
      if (currentConfig && currentConfig.hasApiToken && discoveredZones.length === 0) {
        fetchZonesInWizard();
      }
    }

    function closeWizardModal() {
      document.getElementById('wizardModal').classList.remove('open');
    }

    async function fetchZonesInWizard() {
      const btn = document.getElementById('wizardFetchZonesBtn');
      const tokenVal = document.getElementById('wizardTokenInput').value.trim();
      const container = document.getElementById('wizardZonesContainer');
      btn.disabled = true;
      btn.textContent = '讀取中…';
      try {
        const data = await apiCall('/zones', {
          method: 'POST',
          body: JSON.stringify({ apiToken: tokenVal || undefined }),
        });
        discoveredZones = data.zones || [];
        currentConfig = data.config;
        if (discoveredZones.length === 0) {
          container.innerHTML = '<div style="padding:1rem;text-align:center;">找不到任何有效網域 (Zone)。</div>';
        } else {
          container.innerHTML = discoveredZones
            .map(
              (z) => \`
              <label class="zone-item" style="cursor:pointer;">
                <span style="display:flex;align-items:center;gap:0.55rem;">
                  <input type="checkbox" class="checkbox wizard-zone-check" value="\${escapeHtml(z.id)}" checked />
                  <strong>\${escapeHtml(z.name)}</strong>
                </span>
                <span class="badge">\${escapeHtml(z.status)}</span>
              </label>
            \`
            )
            .join('');
        }
      } catch (err) {
        container.innerHTML = \`<div style="color:var(--destructive);padding:0.75rem;font-size:0.82rem;">\${escapeHtml(err.message)}</div>\`;
      } finally {
        btn.disabled = false;
        btn.textContent = '讀取網域';
      }
    }

    async function runWizardProvision() {
      const btn = document.getElementById('wizardRunBtn');
      const tokenVal = document.getElementById('wizardTokenInput').value.trim();
      const bindRoutes = document.getElementById('wizardBindRoutesCheck').checked;
      const checkedBoxes = Array.from(document.querySelectorAll('.wizard-zone-check:checked'));
      const selectedZoneIds = checkedBoxes.map((cb) => cb.value);

      btn.disabled = true;
      btn.textContent = '處理中…';
      try {
        const data = await apiCall('/scan-dns', {
          method: 'POST',
          body: JSON.stringify({
            apiToken: tokenVal || undefined,
            selectedZoneIds: selectedZoneIds.length > 0 ? selectedZoneIds : undefined,
            bindRoutes,
          }),
        });
        currentConfig = data.config;
        renderUI();
        closeWizardModal();
        const zoneCount = Array.isArray(data.zonesConfigured) ? data.zonesConfigured.length : 1;
        const routeCount = Array.isArray(data.zonesConfigured)
          ? data.zonesConfigured.reduce((acc, z) => acc + (z.routesBound ? z.routesBound.length : 0), 0)
          : 0;
        showToast(
          \`\${zoneCount} 個 Zone，\${routeCount} 條路由，新增 \${data.discovered.length} 個網域\`
        );
      } catch (err) {
        showToast(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '綁定並匯入';
      }
    }

    async function setIndexingMode(mode) {
      try {
        const data = await apiCall('/mode', {
          method: 'POST',
          body: JSON.stringify({ mode }),
        });
        currentConfig = data.config;
        renderUI();
        showToast('模式：' + (mode === 'auto' ? '自動' : '手動'));
      } catch (err) {
        showToast('切換失敗: ' + err.message);
      }
    }

    document.getElementById('addDomainBtn').addEventListener('click', async () => {
      const input = document.getElementById('newDomainInput');
      const renderMode = document.getElementById('newDomainRenderMode').value;
      const hostname = input.value.trim();
      if (!hostname) return showToast('請輸入子網域或網址');
      try {
        const data = await apiCall('/domains', {
          method: 'POST',
          body: JSON.stringify({ hostname, renderMode, enabled: true }),
        });
        input.value = '';
        currentConfig = data.config;
        renderUI();
        showToast('已新增：' + hostname);
      } catch (err) {
        showToast('新增失敗: ' + err.message);
      }
    });

    async function toggleDomainEnabled(hostname, enabled) {
      try {
        const data = await apiCall('/domains', {
          method: 'PATCH',
          body: JSON.stringify({ hostname, enabled }),
        });
        currentConfig = data.config;
        renderUI();
      } catch (err) {
        showToast('更新失敗: ' + err.message);
      }
    }

    async function changeDomainRenderMode(hostname, renderMode) {
      try {
        const data = await apiCall('/domains', {
          method: 'PATCH',
          body: JSON.stringify({ hostname, renderMode }),
        });
        currentConfig = data.config;
        renderUI();
        showToast(\`已更新 \${hostname} 渲染模式為 \${renderMode.toUpperCase()}\`);
      } catch (err) {
        showToast('更新失敗: ' + err.message);
      }
    }

    async function toggleSelectAll(enabled) {
      if (!currentConfig) return;
      for (const key of Object.keys(currentConfig.domains)) {
        currentConfig.domains[key].enabled = enabled;
      }
      try {
        const data = await apiCall('/config', {
          method: 'PUT',
          body: JSON.stringify({ config: currentConfig }),
        });
        currentConfig = data.config;
        renderUI();
        showToast(enabled ? '已全選所有子域' : '已取消全選');
      } catch (err) {
        showToast('更新失敗: ' + err.message);
      }
    }

    async function generateDomain(hostname, btnEl) {
      const origText = btnEl ? btnEl.textContent : '';
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = '處理中…';
      }
      showToast(\`正在處理 \${hostname}…\`);
      try {
        const data = await apiCall('/generate', {
          method: 'POST',
          body: JSON.stringify({ hostname }),
        });
        currentConfig = data.config;
        renderUI();
        showToast(\`\${hostname} 完成，\${data.result.pageCount} 頁\`);
      } catch (err) {
        showToast('生成失敗: ' + err.message);
        await loadConfig();
      } finally {
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.textContent = origText;
        }
      }
    }

    document.getElementById('batchGenerateBtn').addEventListener('click', async () => {
      if (!currentConfig) return;
      const enabledHosts = Object.values(currentConfig.domains)
        .filter((d) => d.enabled)
        .map((d) => d.hostname);

      if (enabledHosts.length === 0) {
        return showToast('沒有已啟用的網域');
      }

      const btn = document.getElementById('batchGenerateBtn');
      btn.disabled = true;
      btn.textContent = \`處理中 (0/\${enabledHosts.length})...\`;

      let done = 0;
      for (const host of enabledHosts) {
        try {
          await apiCall('/generate', {
            method: 'POST',
            body: JSON.stringify({ hostname: host }),
          });
          done++;
          btn.textContent = \`處理中 (\${done}/\${enabledHosts.length})...\`;
        } catch (e) {
        }
      }

      btn.disabled = false;
      btn.textContent = '重新產生全部';
      await loadConfig();
      showToast(\`完成，更新了 \${done} 個網域\`);
    });

    async function removeDomain(hostname) {
      try {
        const data = await apiCall('/domains?hostname=' + encodeURIComponent(hostname), {
          method: 'DELETE',
        });
        currentConfig = data.config;
        renderUI();
        showToast('已刪除：' + hostname);
      } catch (err) {
        showToast('刪除失敗: ' + err.message);
      }
    }

    async function openPreviewModal(hostname) {
      activePreviewHost = hostname;
      activePreviewFull = false;
      document.getElementById('previewModalTitle').textContent = \`快取內容：\${hostname}\`;
      document.getElementById('previewModal').classList.add('open');
      await loadPreviewContent();
    }

    function closePreviewModal() {
      document.getElementById('previewModal').classList.remove('open');
    }

    async function switchPreviewType(full) {
      activePreviewFull = full;
      document.getElementById('btnSwitchLlms').classList.toggle('btn-primary', !full);
      document.getElementById('btnSwitchFull').classList.toggle('btn-primary', full);
      await loadPreviewContent();
    }

    async function loadPreviewContent() {
      const textarea = document.getElementById('previewTextarea');
      textarea.value = '讀取中…';
      const route = activePreviewFull ? '/llms-full.txt' : '/llm.txt';
      document.getElementById('previewDirectLink').href = \`\${route}?domain=\${encodeURIComponent(activePreviewHost)}\`;

      try {
        const data = await apiCall(
          \`/content?hostname=\${encodeURIComponent(activePreviewHost)}&full=\${activePreviewFull ? '1' : '0'}\`
        );
        textarea.value = data.content || '# 尚無快取。按「產生」，或直接在這裡寫好後儲存。';
      } catch (err) {
        textarea.value = '讀取失敗：' + err.message;
      }
    }

    async function saveEditedLlmsTxt() {
      const content = document.getElementById('previewTextarea').value;
      try {
        const data = await apiCall('/content', {
          method: 'PUT',
          body: JSON.stringify({
            hostname: activePreviewHost,
            full: activePreviewFull,
            content,
          }),
        });
        currentConfig = data.config;
        renderUI();
        showToast('已寫入 R2');
        closePreviewModal();
      } catch (err) {
        showToast('儲存失敗: ' + err.message);
      }
    }

    function resetDefaultPrompt() {
      document.getElementById('settingAiPrompt').value = DEFAULT_PROMPT_TEXT;
      showToast('已填入預設 Prompt，按「儲存」後生效');
    }

    async function saveSettingsForm() {
      if (!currentConfig) return;
      currentConfig.defaultRenderMode = document.getElementById('settingDefaultRenderMode').value;
      currentConfig.maxPagesPerDomain = Number(document.getElementById('settingMaxPages').value) || 25;
      const rh = Number(document.getElementById('settingRefreshHours').value);
      currentConfig.autoRefreshHours = Number.isFinite(rh) ? rh : 24;
      currentConfig.aiModel = document.getElementById('settingAiModel').value.trim();
      currentConfig.aiPrompt = document.getElementById('settingAiPrompt').value.trim() || DEFAULT_PROMPT_TEXT;
      currentConfig.enableSpaFallback = document.getElementById('settingSpaFallback').value === 'true';
      currentConfig.cfZoneId = document.getElementById('settingZoneId').value.trim();
      currentConfig.cfAccountId = document.getElementById('settingAccountId').value.trim();
      currentConfig.cfApiToken = document.getElementById('settingApiToken').value.trim();

      try {
        const data = await apiCall('/config', {
          method: 'PUT',
          body: JSON.stringify({ config: currentConfig }),
        });
        currentConfig = data.config;
        renderUI();
        showToast('已儲存');
      } catch (err) {
        showToast('儲存失敗: ' + err.message);
      }
    }

    async function saveRawConfigJson() {
      try {
        const parsed = JSON.parse(document.getElementById('rawConfigTextarea').value);
        const data = await apiCall('/config', {
          method: 'PUT',
          body: JSON.stringify({ config: parsed }),
        });
        currentConfig = data.config;
        renderUI();
        showToast('已套用');
      } catch (err) {
        showToast('JSON 格式或儲存失敗: ' + err.message);
      }
    }

    checkAuthAndInit();
  </script>
</body>
</html>`;
}
