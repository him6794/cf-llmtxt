import { CrawledPage, Env, ExternalLinkItem, RenderMode, SystemConfig } from './types';

const CRAWLER_USER_AGENT = 'CF-LLMTXT-Worker/1.0 (+https://llmstxt.org)';

interface RawParsedHtml {
  title: string;
  description: string;
  headings: string[];
  textChunks: string[];
  links: string[];
  externalLinks: ExternalLinkItem[];
  scriptUrls: string[];
  hasSpaRoot: boolean;
  embeddedStateText: string;
}

function isBoilerplateDescription(desc: string): boolean {
  const lower = desc.trim().toLowerCase();
  return (
    !lower ||
    lower === 'web site created using create-react-app' ||
    lower === 'vite app' ||
    lower === 'react app'
  );
}

function decodeUnicodeEscapes(js: string): string {
  return js.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

async function parseHtmlWithRewriter(response: Response, baseOrigin: string): Promise<RawParsedHtml> {
  if (typeof HTMLRewriter === 'undefined') {
    const rawHtml = await response.text();
    return parseHtmlFallback(rawHtml, baseOrigin);
  }

  let title = '';
  let description = '';
  const headings: string[] = [];
  const textChunks: string[] = [];
  const links = new Set<string>();
  const externalLinks: ExternalLinkItem[] = [];
  const scriptUrls = new Set<string>();
  let hasSpaRoot = false;
  let embeddedStateText = '';

  let currentHeading = '';
  let insideSkippedTag = 0;

  const rewriter = new HTMLRewriter()
    .on('title', {
      text(t) {
        title += t.text;
      },
    })
    .on('meta[name="description"], meta[property="og:description"]', {
      element(el) {
        const content = el.getAttribute('content');
        if (content && !description && !isBoilerplateDescription(content)) {
          description = content.trim();
        }
      },
    })
    .on('meta[property="og:title"]', {
      element(el) {
        const content = el.getAttribute('content');
        if (content && !title) {
          title = content.trim();
        }
      },
    })
    .on('#root, #app, #__next, #__nuxt, [data-reactroot], app-root', {
      element() {
        hasSpaRoot = true;
      },
    })
    .on('script[src], link[rel="modulepreload"][href]', {
      element(el) {
        const rawUrl = el.getAttribute('src') || el.getAttribute('href');
        if (rawUrl && !rawUrl.includes('cloudflare-static') && !rawUrl.includes('challenge-platform') && !rawUrl.includes('.webmcp/')) {
          try {
            const resolved = new URL(rawUrl, baseOrigin);
            if (resolved.origin === baseOrigin && resolved.pathname.endsWith('.js')) {
              scriptUrls.add(resolved.toString());
            }
          } catch {

          }
        }
      },
    })
    .on('script#__NEXT_DATA__, script#__NUXT_DATA__, script[type="application/ld+json"]', {
      text(t) {
        if (t.text) {
          embeddedStateText += ' ' + t.text;
        }
      },
    })
    .on('script, style, noscript, svg, nav, footer, iframe, template', {
      element(el) {
        insideSkippedTag++;
        el.onEndTag(() => {
          insideSkippedTag = Math.max(0, insideSkippedTag - 1);
        });
      },
    })
    .on('h1, h2, h3', {
      element(el) {
        currentHeading = '';
        el.onEndTag(() => {
          const clean = currentHeading.replace(/\s+/g, ' ').trim();
          if (clean && headings.length < 30) {
            headings.push(clean);
          }
          currentHeading = '';
        });
      },
      text(t) {
        if (insideSkippedTag === 0) {
          currentHeading += t.text;
        }
      },
    })
    .on('a[href]', {
      element(el) {
        const href = el.getAttribute('href');
        if (!href) return;
        try {
          const resolved = new URL(href, baseOrigin);
          if (resolved.pathname.includes('/cdn-cgi/')) return;
          if (
            resolved.origin === baseOrigin &&
            !resolved.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js|ico|woff2?|pdf|zip|xml|txt)$/i) &&
            !resolved.pathname.startsWith('/_llmtxt') &&
            resolved.pathname !== '/llm.txt' &&
            resolved.pathname !== '/llms.txt' &&
            resolved.pathname !== '/llms-full.txt'
          ) {
            resolved.hash = '';
            links.add(resolved.toString());
          } else if (
            resolved.origin !== baseOrigin &&
            (resolved.protocol === 'http:' || resolved.protocol === 'https:') &&
            externalLinks.length < 25
          ) {
            externalLinks.push({ title: resolved.hostname + resolved.pathname, url: resolved.toString() });
          }
        } catch {

        }
      },
    })
    .on('body', {
      text(t) {
        if (insideSkippedTag === 0) {
          const cleaned = t.text.replace(/\s+/g, ' ').trim();
          if (cleaned.length > 1) {
            textChunks.push(cleaned);
          }
        }
      },
    });

  await rewriter.transform(response).text();

  return {
    title: title.replace(/\s+/g, ' ').trim(),
    description,
    headings,
    textChunks,
    links: Array.from(links),
    externalLinks,
    scriptUrls: Array.from(scriptUrls),
    hasSpaRoot,
    embeddedStateText: embeddedStateText.slice(0, 6000),
  };
}

function parseHtmlFallback(html: string, baseOrigin: string): RawParsedHtml {
  const titleMatch =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';

  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const rawDesc = descMatch ? decodeEntities(descMatch[1]).replace(/\s+/g, ' ').trim() : '';
  const description = isBoilerplateDescription(rawDesc) ? '' : rawDesc;

  const hasSpaRoot = /id=["'](root|app|__next|__nuxt)["']|data-reactroot|<app-root/i.test(html);

  const scriptUrls = new Set<string>();
  const scriptSrcRegex = /<(?:script[^>]+src|link[^>]+href)=["']([^"']+\.js)["']/gi;
  let sMatch: RegExpExecArray | null;
  while ((sMatch = scriptSrcRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(sMatch[1], baseOrigin);
      if (
        resolved.origin === baseOrigin &&
        !resolved.pathname.includes('cloudflare-static') &&
        !resolved.pathname.includes('challenge-platform') &&
        !resolved.pathname.includes('.webmcp/')
      ) {
        scriptUrls.add(resolved.toString());
      }
    } catch {

    }
  }

  let embeddedStateText = '';
  const stateRegex = /<script[^>]+(?:id=["']__(?:NEXT|NUXT)_DATA__["']|type=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let stateMatch: RegExpExecArray | null;
  while ((stateMatch = stateRegex.exec(html)) !== null) {
    embeddedStateText += ' ' + stateMatch[1];
  }

  const headings: string[] = [];
  const headingRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let hMatch: RegExpExecArray | null;
  while ((hMatch = headingRegex.exec(html)) !== null) {
    const clean = decodeEntities(hMatch[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (clean && headings.length < 30) headings.push(clean);
  }

  const links = new Set<string>();
  const externalLinks: ExternalLinkItem[] = [];
  const linkRegex = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let lMatch: RegExpExecArray | null;
  while ((lMatch = linkRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(lMatch[1], baseOrigin);
      if (resolved.pathname.includes('/cdn-cgi/')) continue;
      if (
        resolved.origin === baseOrigin &&
        !resolved.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js|ico|woff2?|pdf|zip|xml|txt)$/i) &&
        !resolved.pathname.startsWith('/_llmtxt') &&
        resolved.pathname !== '/llm.txt' &&
        resolved.pathname !== '/llms.txt' &&
        resolved.pathname !== '/llms-full.txt'
      ) {
        resolved.hash = '';
        links.add(resolved.toString());
      } else if (
        resolved.origin !== baseOrigin &&
        (resolved.protocol === 'http:' || resolved.protocol === 'https:') &&
        externalLinks.length < 25
      ) {
        externalLinks.push({ title: resolved.hostname + resolved.pathname, url: resolved.toString() });
      }
    } catch {

    }
  }

  const bodyOnly = html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|iframe|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const cleanedBody = decodeEntities(bodyOnly).replace(/\s+/g, ' ').trim();

  return {
    title,
    description,
    headings,
    textChunks: cleanedBody ? [cleanedBody] : [],
    links: Array.from(links),
    externalLinks,
    scriptUrls: Array.from(scriptUrls),
    hasSpaRoot,
    embeddedStateText: embeddedStateText.slice(0, 6000),
  };
}

function decodeEntities(str: string): string {
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractStructuredTextFromJs(jsSource: string): {
  headings: string[];
  lines: string[];
} {

  const targetJs = jsSource.length > 65000 ? jsSource.slice(-65000) : jsSource;
  const decoded = decodeUnicodeEscapes(targetJs);

  const headings: string[] = [];
  const lines: string[] = [];

  const jsxHeadingRegex = /\(["'`](?:h1|h2|h3|th)["'`]\s*,\s*\{[^}]*?children\s*:\s*["'`]([^"'`\\]{2,120})["'`]/g;
  let hm: RegExpExecArray | null;
  while ((hm = jsxHeadingRegex.exec(decoded)) !== null) {
    const val = hm[1].trim();
    if (val && !headings.includes(val) && headings.length < 20) {
      headings.push(val);
    }
  }

  const trRegex = /\(["'`]tr["'`]\s*,\s*\{[\s\S]{1,500}?\]\}\)/g;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(decoded)) !== null) {
    const rowBlock = trMatch[0];
    const cellRegex = /children\s*:\s*["'`]([^"'`\\]{1,160})["'`]/g;
    const cells: string[] = [];
    let cm: RegExpExecArray | null;
    while ((cm = cellRegex.exec(rowBlock)) !== null) {
      cells.push(cm[1].trim());
    }
    if (cells.length >= 2) {
      const rowLine = `| ${cells.join(' | ')} |`;
      if (!lines.includes(rowLine)) lines.push(rowLine);
    }
  }

  const propRegex = /\b(?:title|emphasis|description|label|placeholder|children)\s*:\s*["'`]([^"'`\\]{2,260})["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = propRegex.exec(decoded)) !== null) {
    const val = m[1].replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (
      !val ||
      val.includes('{') ||
      val.includes('function') ||
      val.startsWith('http') ||
      val.startsWith('/') ||
      /^[a-z0-9_.-]+$/i.test(val)
    ) {
      continue;
    }
    if (val.length < 40 && headings.length < 18 && !headings.includes(val)) {
      headings.push(val);
    }
    if (!lines.includes(val)) {
      lines.push(val);
    }
  }

  const multiLineLiteralRegex = /\(\s*["'`]([^"'`]{25,1200}?)["'`]\s*\)/g;
  let mlm: RegExpExecArray | null;
  while ((mlm = multiLineLiteralRegex.exec(decoded)) !== null) {
    const val = mlm[1].replace(/\\n/g, ' / ').replace(/\s+/g, ' ').trim();

    if (/[\u4e00-\u9fff]/.test(val) && !lines.includes(val) && lines.length < 60) {
      lines.push(val.slice(0, 320));
    }
  }

  return { headings, lines };
}

async function inspectSpaBundlesAndApis(
  scriptUrls: string[],
  baseOrigin: string,
  siteDefaultTitle: string,
  siteDefaultDesc: string
): Promise<CrawledPage[]> {
  const ignoredSegments = new Set([
    'login',
    'logout',
    'admin',
    'api',
    'static',
    'assets',
    'cdn-cgi',
    '_llmtxt',
    'status',
    'run',
    'stop',
    'submit_input',
  ]);

  const discoveredRoutes = new Set<string>(['/']);
  const chunkFiles = new Set<string>();
  const chunkTexts: Record<string, string> = {};
  let apiBaseUrl = baseOrigin;

  await Promise.all(
    scriptUrls.slice(0, 4).map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': CRAWLER_USER_AGENT },
          signal: AbortSignal.timeout(4500),
        });
        if (!res.ok) return;
        const js = await res.text();
        if (!js) return;
        chunkTexts[url] = js;

        const routeRegex = /\b(?:path|to)\s*:\s*["'`]([a-zA-Z0-9/_-]+)["'`]/g;
        let rMatch: RegExpExecArray | null;
        while ((rMatch = routeRegex.exec(js)) !== null) {
          const rawPath = rMatch[1].trim();
          if (!rawPath || rawPath === '*' || rawPath.includes(':') || rawPath.includes('*')) continue;
          const normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
          const firstSeg = normalized.split('/').filter(Boolean)[0]?.toLowerCase() || '';
          if (!firstSeg || ignoredSegments.has(firstSeg) || normalized.endsWith('/random')) continue;
          discoveredRoutes.add(normalized);
        }

        const chunkRegex = /["'`](assets\/[a-zA-Z0-9_-]+\.js)["'`]/g;
        let cMatch: RegExpExecArray | null;
        while ((cMatch = chunkRegex.exec(js)) !== null) {
          const chunkPath = cMatch[1];
          if (!chunkPath.includes('admin') && !chunkPath.includes('login') && !chunkPath.includes('turnstile')) {
            chunkFiles.add(`${baseOrigin}/${chunkPath}`);
          }
        }

        const apiOriginMatch = js.match(/["'`](https:\/\/[a-zA-Z0-9.-]+)["'`]\.replace\(\/\\\/\+?\$\//);
        if (apiOriginMatch && isSameSiteOrigin(apiOriginMatch[1], baseOrigin)) {
          apiBaseUrl = apiOriginMatch[1];
        }
      } catch {

      }
    })
  );

  const apiEndpoints = new Set<string>();

  await Promise.all(
    Array.from(chunkFiles)
      .slice(0, 10)
      .map(async (chunkUrl) => {
        try {
          const res = await fetch(chunkUrl, {
            headers: { 'User-Agent': CRAWLER_USER_AGENT },
            signal: AbortSignal.timeout(3500),
          });
          if (!res.ok) return;
          const text = await res.text();
          chunkTexts[chunkUrl] = text;

          const apiCallRegex = /\b[a-zA-Z_$][\w$]*\(\s*["'`](\/[a-zA-Z0-9_-]+)["'`]\s*\)/g;
          let m: RegExpExecArray | null;
          while ((m = apiCallRegex.exec(text)) !== null) {
            const ep = m[1];
            const seg = ep.slice(1).toLowerCase();
            if (
              seg &&
              !ignoredSegments.has(seg) &&
              !['visit', 'random'].includes(seg) &&
              ep.length > 2
            ) {
              apiEndpoints.add(ep);
            }
          }
        } catch {

        }
      })
  );

  if (discoveredRoutes.has('/portfolio')) apiEndpoints.add('/projects');
  if (discoveredRoutes.has('/experience')) apiEndpoints.add('/experience');
  if (discoveredRoutes.has('/blog')) apiEndpoints.add('/posts');
  if (discoveredRoutes.has('/friends')) apiEndpoints.add('/friends');

  const apiDataMap: Record<string, any> = {};
  await Promise.all(
    Array.from(apiEndpoints).map(async (ep) => {
      const candidateUrls = [`${apiBaseUrl}/api${ep}`, `${baseOrigin}/api${ep}`];
      for (const apiUrl of candidateUrls) {
        try {
          const res = await fetch(apiUrl, {
            headers: {
              Accept: 'application/json',
              'User-Agent': CRAWLER_USER_AGENT,
            },
            signal: AbortSignal.timeout(4000),
          });
          if (!res.ok) continue;
          const ct = res.headers.get('content-type') || '';
          if (!ct.includes('json')) continue;
          const json = await res.json();
          if (json && typeof json === 'object') {
            apiDataMap[ep] = json;
            break;
          }
        } catch {

        }
      }
    })
  );

  const extractStringsFromChunk = (keywords: string[]): { headings: string[]; lines: string[] } => {
    const headings: string[] = [];
    const lines: string[] = [];
    for (const [url, js] of Object.entries(chunkTexts)) {
      const lowerUrl = url.toLowerCase();
      if (!keywords.some((k) => lowerUrl.includes(k.toLowerCase()))) continue;
      const extracted = extractStructuredTextFromJs(js);
      for (const h of extracted.headings) {
        if (!headings.includes(h) && headings.length < 20) headings.push(h);
      }
      for (const l of extracted.lines) {
        if (!lines.includes(l) && lines.length < 80) lines.push(l);
      }
    }
    return { headings, lines };
  };

  const pages: CrawledPage[] = [];
  const allExternalLinks: ExternalLinkItem[] = [];

  const projectsList: any[] = Array.isArray(apiDataMap['/projects']?.projects)
    ? apiDataMap['/projects'].projects
    : Array.isArray(apiDataMap['/projects'])
    ? apiDataMap['/projects']
    : [];

  let projectsMd = '';
  const projectHeadings: string[] = [];
  for (const proj of projectsList) {
    const title = (proj.Title || proj.title || proj.name || '').trim();
    const desc = (proj.Description || proj.description || '').trim();
    const github = (proj.GithubURL || proj.githubUrl || proj.github || '').trim();
    const demo = (proj.DemoURL || proj.demoUrl || proj.url || '').trim();
    if (!title) continue;
    projectHeadings.push(`${title}${desc ? ` (${desc})` : ''}`);
    projectsMd += `### ${title}\n`;
    if (desc) projectsMd += `- 專案簡介: ${desc}\n`;
    if (github) {
      projectsMd += `- GitHub 原始碼: ${github}\n`;
      allExternalLinks.push({ title: `${title} — ${desc || 'GitHub Source'}`, url: github });
    }
    if (demo) {
      projectsMd += `- 線上展示 (Live Demo): ${demo}\n`;
      allExternalLinks.push({ title: `${title} — Live Demo (${demo})`, url: demo });
    }
    projectsMd += `\n`;
  }

  const expList: any[] = Array.isArray(apiDataMap['/experience']?.experiences)
    ? apiDataMap['/experience'].experiences
    : [];
  const skillsList: any[] = Array.isArray(apiDataMap['/experience']?.skills)
    ? apiDataMap['/experience'].skills
    : [];

  let expMd = '';
  const expHeadings: string[] = [];
  if (expList.length > 0) {
    expMd += `## 經歷與競賽獲獎 (Experience & Achievements)\n\n`;
    for (const item of expList) {
      const title = (item.Title || item.title || '').trim();
      const company = (item.Company || item.company || item.organization || '').trim();
      const period = (item.Period || item.period || item.year || '').trim();
      const desc = (item.Description || item.description || '').trim();
      if (!title) continue;
      expHeadings.push(`${period ? period + ' ' : ''}${title}${company ? ` (${company})` : ''}`);
      expMd += `- **${title}**${company ? ` — ${company}` : ''}${period ? ` [${period}]` : ''}${desc ? `: ${desc}` : ''}\n`;
    }
    expMd += `\n`;
  }
  if (skillsList.length > 0) {
    expMd += `## 技術棧與工具 (Technical Skills & Toolkit)\n\n`;
    const groupedSkills: Record<string, string[]> = {};
    for (const sk of skillsList) {
      const cat = (sk.Category || sk.category || 'Skills').trim();
      const name = (sk.Name || sk.name || '').trim();
      if (name) {
        if (!groupedSkills[cat]) groupedSkills[cat] = [];
        groupedSkills[cat].push(name);
      } else if (Array.isArray(sk.Items || sk.items)) {
        groupedSkills[cat] = (sk.Items || sk.items).map((x: any) => String(x).trim());
      }
    }
    for (const [cat, names] of Object.entries(groupedSkills)) {
      if (names.length > 0) {
        expMd += `- **${cat}**: ${names.join(', ')}\n`;
      }
    }
    expMd += `\n`;
  }

  const postsList: any[] = Array.isArray(apiDataMap['/posts']?.posts)
    ? apiDataMap['/posts'].posts
    : Array.isArray(apiDataMap['/posts'])
    ? apiDataMap['/posts']
    : [];

  const fullPostMap: Record<string, string> = {};
  const fetchFullPost = async (post: any) => {
    const rawSlug = String(post.slug || post.Slug || post.id || '').trim();
    const previewContent = String(post.content || post.Content || post.summary || '').trim();
    if (!rawSlug) return;
    if (!(previewContent.endsWith('…') || previewContent.endsWith('...') || previewContent.length < 600)) return;
    const encodedSlug = encodeURIComponent(rawSlug);
    for (const detailUrl of [`${apiBaseUrl}/api/posts/${encodedSlug}`, `${baseOrigin}/api/posts/${encodedSlug}`]) {
      try {
        const res = await fetch(detailUrl, {
          headers: { Accept: 'application/json', 'User-Agent': CRAWLER_USER_AGENT },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) continue;
        const detailJson = (await res.json()) as any;
        const fullBody = String(
          detailJson?.post?.content || detailJson?.post?.Content || detailJson?.content || detailJson?.Content || ''
        ).trim();
        if (fullBody && fullBody.length > previewContent.length) {
          fullPostMap[rawSlug] = fullBody;
          return;
        }
      } catch {

      }
    }
  };
  const postsToFetch = postsList.slice(0, 40);
  for (let i = 0; i < postsToFetch.length; i += 10) {
    await Promise.all(postsToFetch.slice(i, i + 10).map(fetchFullPost));
  }

  let blogIndexMd = '';
  const blogHeadings: string[] = [];
  const articlePages: CrawledPage[] = [];

  for (const post of postsList) {
    const title = (post.title || post.Title || '').trim();
    const rawSlug = String(post.slug || post.Slug || post.id || '').trim();
    const rawContent = (
      fullPostMap[rawSlug] ||
      String(post.content || post.Content || post.summary || '')
    )
      .replace(/\r\n/g, '\n')
      .trim();
    const date = post.createdAt || post.CreatedAt || '';
    if (!title || !rawSlug) continue;

    const safeSlugPath = encodeURI(rawSlug);
    const postUrl = `${baseOrigin}/blog/${safeSlugPath}`;
    const excerpt = rawContent
      .replace(/^#+\s+.+$/gm, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300)
      .replace(/[…]+$|\.{3,}$/, '')
      .trim();

    const postHeadings: string[] = [];
    const mdHeadingRegex = /^#{1,3}\s+(.+)$/gm;
    let phm: RegExpExecArray | null;
    while ((phm = mdHeadingRegex.exec(rawContent)) !== null) {
      const hText = phm[1].replace(/\s+/g, ' ').trim();
      if (hText && !postHeadings.includes(hText) && postHeadings.length < 20) {
        postHeadings.push(hText);
      }
    }
    if (postHeadings.length === 0) postHeadings.push(title);

    blogHeadings.push(title);
    blogIndexMd += `### [${title}](${postUrl})\n`;
    if (date) blogIndexMd += `- 發布日期: ${date}\n`;
    if (postHeadings.length > 1) {
      blogIndexMd += `- 文章章節: ${postHeadings.join(' / ')}\n`;
    }
    if (excerpt) blogIndexMd += `- 內容摘要: ${excerpt}\n\n`;

    articlePages.push({
      url: postUrl,
      path: `/blog/${safeSlugPath}`,
      title,
      description: excerpt || title,
      headings: postHeadings,
      content: rawContent.replace(/\s+/g, ' ').trim().slice(0, 15000),
      markdown: rawContent.slice(0, 40000),
      isSpaRendered: true,
    });
  }

  const friendsList: any[] = Array.isArray(apiDataMap['/friends']?.friends)
    ? apiDataMap['/friends'].friends
    : [];
  let friendsMd = '';
  const friendsHeadings: string[] = [];
  for (const fr of friendsList) {
    const name = (fr.Name || fr.name || '').trim();
    const fUrl = (fr.URL || fr.url || '').trim();
    const desc = String(fr.Description || fr.description || '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    friendsHeadings.push(`${name}${desc ? ` (${desc})` : ''}`);
    friendsMd += `- [${name}](${fUrl})${desc ? `: ${desc}` : ''}\n`;
    if (fUrl) {
      allExternalLinks.push({ title: `${name}${desc ? ` — ${desc}` : ''}`, url: fUrl });
    }
  }

  const homeChunk = extractStringsFromChunk(['home', 'main.', 'index-']);
  const effectiveHomeDesc =
    siteDefaultDesc ||
    homeChunk.lines.slice(0, 4).join(' ') ||
    `${siteDefaultTitle} 線上服務與網站內容。`;

  const homeMd = [
    `# ${siteDefaultTitle}`,
    effectiveHomeDesc,
    homeChunk.lines.join('\n'),
    projectsMd ? `## 代表專案 (Featured Projects)\n\n${projectsMd}` : '',
    expMd ? expMd : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  pages.push({
    url: `${baseOrigin}/`,
    path: '/',
    title: siteDefaultTitle,
    description: effectiveHomeDesc,
    headings: Array.from(new Set([...homeChunk.headings.slice(0, 10), ...projectHeadings.slice(0, 6)])),
    content: homeMd.replace(/\s+/g, ' ').trim().slice(0, 15000),
    markdown: homeMd.slice(0, 40000),
    externalLinks: allExternalLinks.slice(0, 20),
    isSpaRendered: true,
  });

  if (discoveredRoutes.has('/portfolio')) {
    const portChunk = extractStringsFromChunk(['portfolio']);
    const md = [`# Portfolio & Projects`, portChunk.lines.join(' '), projectsMd]
      .filter(Boolean)
      .join('\n\n');
    pages.push({
      url: `${baseOrigin}/portfolio`,
      path: '/portfolio',
      title: `Work & Portfolio`,
      description:
        projectHeadings.length > 0
          ? `收錄開發專案：${projectHeadings.join('、')}。`
          : 'Portfolio and software engineering projects.',
      headings: projectHeadings.length > 0 ? projectHeadings : portChunk.headings,
      content: md.replace(/\s+/g, ' ').trim().slice(0, 15000),
      markdown: md.slice(0, 40000),
      externalLinks: allExternalLinks,
      isSpaRendered: true,
    });
  }

  if (discoveredRoutes.has('/experience')) {
    const expChunk = extractStringsFromChunk(['experience']);
    const md = [`# Experience & Expertise`, expChunk.lines.join(' '), expMd]
      .filter(Boolean)
      .join('\n\n');
    pages.push({
      url: `${baseOrigin}/experience`,
      path: '/experience',
      title: `Expertise & Experience`,
      description:
        expHeadings.length > 0
          ? `實戰經歷與獎項：${expHeadings.slice(0, 8).join('、')}。`
          : 'Professional experience, awards, and technical skills.',
      headings: expHeadings.length > 0 ? expHeadings : expChunk.headings,
      content: md.replace(/\s+/g, ' ').trim().slice(0, 15000),
      markdown: md.slice(0, 40000),
      isSpaRendered: true,
    });
  }

  if (discoveredRoutes.has('/blog')) {
    const blogChunk = extractStringsFromChunk(['blog']);
    const md = [`# Blog & Writing`, blogChunk.lines.join(' '), blogIndexMd]
      .filter(Boolean)
      .join('\n\n');
    pages.push({
      url: `${baseOrigin}/blog`,
      path: '/blog',
      title: `Writing & Blog`,
      description:
        blogHeadings.length > 0
          ? `技術文章列表：收錄《${blogHeadings.join('》、《')}》等文章。`
          : 'Technical writing, notes, and articles.',
      headings: blogHeadings.length > 0 ? blogHeadings : blogChunk.headings,
      content: md.replace(/\s+/g, ' ').trim().slice(0, 15000),
      markdown: md.slice(0, 40000),
      isSpaRendered: true,
    });
  }

  if (discoveredRoutes.has('/friends')) {
    const frChunk = extractStringsFromChunk(['friends']);
    const md = [`# Friends & Network`, frChunk.lines.join(' '), friendsMd]
      .filter(Boolean)
      .join('\n\n');
    pages.push({
      url: `${baseOrigin}/friends`,
      path: '/friends',
      title: `Friends & Links`,
      description:
        friendsHeadings.length > 0
          ? `友站與社群夥伴連結：${friendsHeadings.slice(0, 8).join('、')}。`
          : 'Developer network and friend links.',
      headings: friendsHeadings.length > 0 ? friendsHeadings : frChunk.headings,
      content: md.replace(/\s+/g, ' ').trim().slice(0, 15000),
      markdown: md.slice(0, 40000),
      isSpaRendered: true,
    });
  }

  if (discoveredRoutes.has('/contact')) {
    const ctChunk = extractStringsFromChunk(['contact']);
    const md = [`# Contact`, ctChunk.lines.join('\n')].filter(Boolean).join('\n\n');
    pages.push({
      url: `${baseOrigin}/contact`,
      path: '/contact',
      title: `Contact`,
      description: `聯絡表單與社群聯絡管道 (${cleanHostFromOrigin(baseOrigin)}/contact)。`,
      headings: ctChunk.headings,
      content: md.replace(/\s+/g, ' ').trim().slice(0, 2000),
      markdown: md.slice(0, 3000),
      isSpaRendered: true,
    });
  }

  for (const postPage of articlePages) {
    pages.push(postPage);
  }

  return pages;
}

function cleanHostFromOrigin(origin: string): string {
  return origin.replace(/^https?:\/\//, '');
}

function isSameSiteOrigin(candidateOrigin: string, baseOrigin: string): boolean {
  try {
    const a = new URL(candidateOrigin);
    const b = new URL(baseOrigin);
    if (a.protocol !== 'https:' && a.protocol !== 'http:') return false;
    const tail = (h: string) => h.split('.').slice(-2).join('.');
    return tail(a.hostname) === tail(b.hostname);
  } catch {
    return false;
  }
}

async function fetchSpaRenderedMarkdown(
  targetUrl: string,
  env: Env,
  config: SystemConfig
): Promise<{
  title?: string;
  content: string;
  markdown: string;
  headings: string[];
  links: string[];
  externalLinks: ExternalLinkItem[];
} | null> {
  const accountId = config.cfAccountId || env.CF_ACCOUNT_ID;
  const apiToken = config.cfApiToken || env.CF_API_TOKEN;
  const baseOrigin = new URL(targetUrl).origin;

  if (accountId && apiToken && !apiToken.includes('•')) {
    try {
      const brRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/browser-rendering/markdown`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: targetUrl,
            rejectResourceTypes: ['image', 'media', 'font'],
          }),
          signal: AbortSignal.timeout(8500),
        }
      );

      if (brRes.ok) {
        const data = (await brRes.json()) as { success: boolean; result?: string };
        if (data.success && data.result && data.result.trim().length > 80) {
          return parseMarkdownIntoPageData(data.result, baseOrigin);
        }
      }
    } catch {

    }
  }

  if (config.enableSpaFallback !== false) {
    try {
      const readerUrl = `https://r.jina.ai/${targetUrl}`;
      const res = await fetch(readerUrl, {
        headers: {
          'X-Wait-For-Selector': 'h1, h2, h3, article',
          'User-Agent': 'Mozilla/5.0 (compatible; CF-LLMTXT/1.0)',
        },
        signal: AbortSignal.timeout(8500),
      });
      if (res.ok) {
        const md = await res.text();
        if (md && md.trim().length > 80) {
          return parseMarkdownIntoPageData(md, baseOrigin);
        }
      }
    } catch {

    }
  }

  return null;
}

function parseMarkdownIntoPageData(
  rawMd: string,
  baseOrigin: string
): {
  title?: string;
  content: string;
  markdown: string;
  headings: string[];
  links: string[];
  externalLinks: ExternalLinkItem[];
} {
  let title: string | undefined;
  const titleMatch = rawMd.match(/^Title:\s*(.+)$/m) || rawMd.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  let bodyMd = rawMd;
  const mdMarker = rawMd.indexOf('Markdown Content:');
  if (mdMarker !== -1) {
    bodyMd = rawMd.slice(mdMarker + 'Markdown Content:'.length).trim();
  }

  const headings: string[] = [];
  const headingRegex = /^#{1,3}\s+(.+)$/gm;
  let hMatch: RegExpExecArray | null;
  while ((hMatch = headingRegex.exec(bodyMd)) !== null) {
    const cleanH = hMatch[1]
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[_*~`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanH && headings.length < 30) {
      headings.push(cleanH);
    }
  }

  const links = new Set<string>();
  const externalLinks: ExternalLinkItem[] = [];
  const seenExternal = new Set<string>();
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(bodyMd)) !== null) {
    const label = match[1].replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    const rawHref = match[2].trim();
    try {
      const u = new URL(rawHref);
      if (u.pathname.includes('/cdn-cgi/')) continue;
      if (
        u.origin === baseOrigin &&
        !u.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js|ico|woff2?|pdf|zip|xml|txt)$/i) &&
        !u.pathname.startsWith('/_llmtxt') &&
        u.pathname !== '/llm.txt' &&
        u.pathname !== '/llms.txt' &&
        u.pathname !== '/llms-full.txt'
      ) {
        u.hash = '';
        links.add(u.toString());
      } else if (
        u.origin !== baseOrigin &&
        !u.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js|ico)$/i) &&
        !seenExternal.has(u.toString()) &&
        externalLinks.length < 25
      ) {
        seenExternal.add(u.toString());
        externalLinks.push({
          title: label && label !== 'Source' && label !== 'Live site' ? label : u.hostname + u.pathname,
          url: u.toString(),
        });
      }
    } catch {

    }
  }

  const cleanedMd = bodyMd
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[Skip to content\]\([^)]+\)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const flatContent = cleanedMd.replace(/\s+/g, ' ').trim().slice(0, 4500);

  return {
    title,
    content: flatContent,
    markdown: cleanedMd.slice(0, 6000),
    headings,
    links: Array.from(links),
    externalLinks,
  };
}

async function fetchSitemapUrls(baseOrigin: string, maxUrls: number): Promise<string[]> {
  try {
    const res = await fetch(`${baseOrigin}/sitemap.xml`, {
      headers: {
        'User-Agent': CRAWLER_USER_AGENT,
        'X-CF-LLMTXT-Crawler': '1',
      },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const urls: string[] = [];
    const locRegex = /<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi;
    let match: RegExpExecArray | null;
    while ((match = locRegex.exec(xml)) !== null) {
      const candidate = match[1].trim();
      if (!candidate.endsWith('.xml') && !candidate.endsWith('/llm.txt') && !candidate.endsWith('/llms.txt')) {
        urls.push(candidate);
      }
      if (urls.length >= maxUrls) break;
    }
    return urls;
  } catch {
    return [];
  }
}

export async function crawlSinglePage(
  targetUrl: string,
  renderMode: RenderMode,
  env: Env,
  config: SystemConfig
): Promise<{
  page: CrawledPage;
  discoveredLinks: string[];
  spaBundlePages?: CrawledPage[];
} | null> {
  const urlObj = new URL(targetUrl);
  const baseOrigin = urlObj.origin;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': CRAWLER_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'X-CF-LLMTXT-Crawler': '1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return null;
    }

    const parsed = await parseHtmlWithRewriter(res, baseOrigin);
    let bodyText = parsed.textChunks.join(' ').trim();
    let markdownText = bodyText;
    let headings = parsed.headings;
    let externalLinks = parsed.externalLinks;
    let isSpaRendered = false;
    let discoveredLinks = parsed.links;

    const looksLikeEmptySpa =
      renderMode !== 'ssr' &&
      (renderMode === 'spa' || bodyText.length < 180 || (parsed.hasSpaRoot && bodyText.length < 350));

    if (looksLikeEmptySpa) {
      if ((urlObj.pathname === '/' || urlObj.pathname === '') && parsed.scriptUrls.length > 0) {
        const spaPages = await inspectSpaBundlesAndApis(
          parsed.scriptUrls,
          baseOrigin,
          parsed.title || urlObj.hostname,
          parsed.description || ''
        );
        if (spaPages.length > 0 && (spaPages.length > 1 || spaPages[0].content.length > 80)) {
          return {
            page: spaPages[0],
            discoveredLinks: [],
            spaBundlePages: spaPages.slice(1),
          };
        }
      }

      const spaData = await fetchSpaRenderedMarkdown(targetUrl, env, config);
      if (spaData && spaData.content.length > bodyText.length) {
        bodyText = spaData.content;
        markdownText = spaData.markdown;
        if (spaData.title) parsed.title = spaData.title;
        if (spaData.headings.length > 0) headings = spaData.headings;
        if (spaData.externalLinks.length > 0) externalLinks = spaData.externalLinks;
        if (spaData.links.length > 0) {
          discoveredLinks = Array.from(new Set([...discoveredLinks, ...spaData.links]));
        }
        isSpaRendered = true;
      } else if (parsed.embeddedStateText.length > 80) {
        const extractedStrings = parsed.embeddedStateText
          .replace(/[{}[\]",:]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (extractedStrings.length > bodyText.length) {
          bodyText = `${bodyText} ${extractedStrings}`.trim();
          markdownText = bodyText;
        }
      }
    }

    const fallbackTitle =
      parsed.title ||
      headings[0] ||
      (urlObj.pathname === '/' ? urlObj.hostname : urlObj.pathname.replace(/^\/|\/$/g, ''));

    return {
      page: {
        url: targetUrl,
        path: urlObj.pathname || '/',
        title: fallbackTitle,
        description: parsed.description || bodyText.slice(0, 240),
        headings,
        content: bodyText.slice(0, 15000),
        markdown: markdownText.slice(0, 40000),
        externalLinks,
        isSpaRendered,
      },
      discoveredLinks,
    };
  } catch {
    return null;
  }
}

export async function crawlDomain(
  hostname: string,
  renderMode: RenderMode,
  env: Env,
  config: SystemConfig
): Promise<{ pages: CrawledPage[]; detectedSpa: boolean }> {
  const cleanHost = hostname.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const baseOrigin = `https://${cleanHost}`;
  const configuredMax = config.maxPagesPerDomain && config.maxPagesPerDomain > 10 ? config.maxPagesPerDomain : 25;
  const maxPages = Math.min(Math.max(configuredMax, 1), 40);

  const visited = new Set<string>();
  const pages: CrawledPage[] = [];
  let detectedSpa = renderMode === 'spa';

  const homeUrl = `${baseOrigin}/`;
  visited.add(homeUrl);

  const [homeResult, sitemapUrls] = await Promise.all([
    crawlSinglePage(homeUrl, renderMode, env, config),
    fetchSitemapUrls(baseOrigin, maxPages),
  ]);

  const queue: string[] = [];
  if (homeResult) {
    pages.push(homeResult.page);
    if (homeResult.page.isSpaRendered) detectedSpa = true;

    if (homeResult.spaBundlePages && homeResult.spaBundlePages.length > 0) {
      detectedSpa = true;
      for (const sp of homeResult.spaBundlePages) {
        if (pages.length < maxPages && !visited.has(sp.url)) {
          visited.add(sp.url);
          pages.push(sp);
        }
      }
    }

    for (const link of homeResult.discoveredLinks) {
      if (!visited.has(link)) queue.push(link);
    }
  }

  for (const sUrl of sitemapUrls) {
    if (!visited.has(sUrl)) queue.push(sUrl);
  }

  const candidateUrls = Array.from(new Set(queue))
    .filter((u) => {
      try {
        const parsed = new URL(u);
        return parsed.origin === baseOrigin && !visited.has(parsed.toString());
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.split('/').length - b.split('/').length)
    .slice(0, Math.max(0, maxPages - pages.length));

  for (const u of candidateUrls) visited.add(u);

  const batchSize = 4;
  for (let i = 0; i < candidateUrls.length; i += batchSize) {
    const batch = candidateUrls.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((url) => crawlSinglePage(url, detectedSpa ? 'spa' : renderMode, env, config))
    );
    for (const r of results) {
      if (r) {
        pages.push(r.page);
        if (r.page.isSpaRendered) detectedSpa = true;
      }
    }
  }

  if (pages.length === 0) {

    throw new Error(`無法讀取 ${cleanHost}：沒有取得任何可用的 HTML 頁面（連線失敗、被擋或非網頁）`);
  }

  return { pages, detectedSpa };
}
