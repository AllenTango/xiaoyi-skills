# render.js / dev.js / preview.js 规格文档

此文档定义 AI 生成渲染管线时应产出的 Node.js 脚本完整规格。AI 按此规格生成代码，写入用户项目的 `.xiaoyi-ssg/`。

---

## 技术约束

- **Node.js 18+**（LTS，内置 `fetch`、`fs.cpSync`）
- **ESM 模块系统**（`"type": "module"`，使用 `import`/`export`）
- **路径推导**：`render.js`、`dev.js`、`preview.js` 必须从 `import.meta.url` 推导 `PIPELINE_DIR`，再用 `dirname(PIPELINE_DIR)` 推导 `SITE_ROOT`。不要用 `process.cwd()` 作为站点根；这样脚本既可通过 `cd .xiaoyi-ssg && npm run build/dev/preview` 运行，也可从站点根用 `node .xiaoyi-ssg/*.js` 运行。
- 依赖：`js-yaml`（YAML 解析）、`marked`（Markdown → HTML）、`chokidar`（文件监听，仅 dev.js）
- 模板引擎：必须支持 HTML 转义、raw HTML、条件、数组循环、属性安全输出和 `data-*` 交互钩子；可自实现，复杂站点可引入轻量模板依赖并写入 package.json 与 manifest
- 三个独立文件：`render.js`（构建）、`dev.js`（开发）、`preview.js`（预览）
- 允许生成 `assets/script.js`、`assets/interactions/*.js`、`assets/data/*.json` 来实现静态托管兼容的浏览器交互；交互不得依赖 dev server 才能工作

---

## render.js — 核心渲染脚本

### 核心结构

```javascript
#!/usr/bin/env node
/**
 * xiaoyi-ssg 渲染管线 - 自动生成，请勿手动修改
 * 重新生成：/xiaoyi-ssg → 调整风格/内容类型 → 重新生成管线
 * 生成时间: {{GENERATED_AT}}
 * 主题参考: {{THEME_REF}}
 * Tokens Hash: {{TOKENS_HASH}}
 * Content-Types Hash: {{CONTENT_TYPES_HASH}}
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import yaml from 'js-yaml';
import { marked } from 'marked';

const PIPELINE_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = dirname(PIPELINE_DIR);
const PUBLIC_DIR = join(SITE_ROOT, 'public');
const CACHE_FILE = join(SITE_ROOT, '.xiaoyi-ssg-cache.json');
const INTERACTIONS_MANIFEST = join(PIPELINE_DIR, 'interactions.manifest.json');

// 加载配置与数据
function loadConfig() {
  const raw = readFileSync(join(SITE_ROOT, 'config.yml'), 'utf-8');
  return yaml.load(raw);
}

function loadTokens() {
  return JSON.parse(readFileSync(join(SITE_ROOT, '.xiaoyi-ssg-design-tokens.json'), 'utf-8'));
}

function loadContentTypes() {
  return JSON.parse(readFileSync(join(PIPELINE_DIR, 'content-types.json'), 'utf-8'));
}

function loadCache() {
  if (existsSync(CACHE_FILE)) {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  }
  return { version: 1, outputs: {} };
}

function loadTemplates() {
  const templates = {};
  const templatesDir = join(PIPELINE_DIR, 'templates');
  for (const file of readdirSync(templatesDir)) {
    if (file.endsWith('.html')) {
      templates[file.replace(/\.html$/, '')] = readFileSync(join(templatesDir, file), 'utf-8');
    }
  }
  return templates;
}

function loadInteractionsManifest() {
  if (!existsSync(INTERACTIONS_MANIFEST)) return { version: 1, interactions: [] };
  return JSON.parse(readFileSync(INTERACTIONS_MANIFEST, 'utf-8'));
}

// 主构建流程
async function build(fresh = false) {
  const config = loadConfig();
  const tokens = loadTokens();
  const contentTypes = loadContentTypes();
  const interactions = loadInteractionsManifest();
  const cache = loadCache();
  const templates = loadTemplates();

  // 1. 扫描内容
  const allItems = scanContent(contentTypes);

  // 2. 计算全局数据
  const nav = buildNav(config, contentTypes);
  const paginationPlans = buildPagination(allItems, config, contentTypes);
  const prevNextMap = buildPrevNext(allItems);
  const interactionData = buildInteractionData(allItems, contentTypes, interactions, config);

  // 3. 渲染各页面（包含交互钩子）
  const outputs = renderAllPages(allItems, nav, paginationPlans, prevNextMap, config, tokens, contentTypes, templates, interactions, cache, fresh);

  // 4. 复制资源并写入交互数据
  copyAssets();
  writeInteractionData(interactionData);

  // 5. 生成附加产物
  generateFeeds(allItems, config);
  generateSitemap(outputs, config);
  generate404(config, tokens, templates, nav);

  // 6. 保存缓存
  saveCache(cache);

  // 7. 输出摘要
  printSummary(outputs);
}
```

### 交互数据生成

```javascript
function buildInteractionData(allItems, contentTypes, interactions, config) {
  const data = {};
  for (const interaction of interactions.interactions || []) {
    if (interaction.name.includes('search')) {
      data['search-index.json'] = Object.values(allItems).flat().map(item => ({
        title: item.title,
        url: item.url,
        type: item.type,
        excerpt: item.excerpt || '',
        tags: item.tags || [],
        text: [item.title, item.excerpt, item.bodyText].filter(Boolean).join(' ')
      }));
    }
    if (interaction.name.includes('filter')) {
      const types = interaction.content_types || Object.keys(allItems);
      data[`${interaction.name}.json`] = {
        items: types.flatMap(type => (allItems[type] || []).map(item => ({
          title: item.title,
          url: item.url,
          type,
          tags: item.tags || [],
          categories: item.categories || [],
          date: item.date || ''
        })))
      };
    }
  }
  return data;
}

function writeInteractionData(data) {
  const dataDir = join(PUBLIC_DIR, 'assets', 'data');
  for (const [file, payload] of Object.entries(data)) {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, file), JSON.stringify(payload, null, 2), 'utf-8');
  }
}
```

### 内容扫描

```javascript
function scanContent(contentTypes) {
  const itemsByType = {};
  for (const [typeKey, typeDef] of Object.entries(contentTypes.types || {})) {
    const contentDir = join(SITE_ROOT, typeDef.dir);
    if (!existsSync(contentDir)) {
      itemsByType[typeKey] = [];
      continue;
    }
    const items = [];
    for (const mdFile of readdirSync(contentDir)) {
      if (!mdFile.endsWith('.md')) continue;
      const item = parseContentFile(join(contentDir, mdFile), typeKey, typeDef);
      if (item && !item.draft) items.push(item);
    }
    // 按日期倒序
    items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    itemsByType[typeKey] = items;
  }
  return itemsByType;
}

function parseContentFile(filePath, typeKey, typeDef) {
  const content = readFileSync(filePath, 'utf-8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  let fm;
  try {
    fm = yaml.load(fmMatch[1]);
  } catch (e) {
    console.error(`Warning: YAML parse error in ${filePath}: ${e.message}`);
    return null;
  }

  // 校验必需字段
  for (const [fieldName, fieldDef] of Object.entries(typeDef.fields || {})) {
    if (fieldDef.required && !(fieldName in fm)) {
      console.error(`Warning: ${filePath} missing required field: ${fieldName}`);
      return null;
    }
  }

  // 计算 slug
  let slug = basename(filePath, '.md');
  slug = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');

  // 正文
  const body = content.slice(fmMatch[0].length).trim();
  const bodyHtml = marked.parse(body);

  return {
    type: typeKey,
    slug,
    title: fm.title || '',
    date: fm.date || '',
    dateDisplay: formatDate(fm.date || ''),
    tags: fm.tags || [],
    categories: fm.categories || [],
    cover: fm.cover || '',
    excerpt: fm.excerpt || autoExcerpt(bodyHtml),
    url: joinPath(typeKey, slug),
    bodyHtml,
    draft: fm.draft || false,
    customFields: Object.fromEntries(
      Object.entries(fm).filter(([k]) => !['title','date','tags','categories','cover','excerpt','draft'].includes(k))
    )
  };
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toISOString().slice(0, 10);
}

function autoExcerpt(html, length = 200) {
  const text = html.replace(/<[^>]+>/g, '');
  return text.slice(0, length) + (text.length > length ? '...' : '');
}

function normalizePath(path) {
  if (!path || path === '/') return '/';
  const cleaned = String(path).replace(/^\/+|\/+$/g, '');
  return cleaned ? `/${cleaned}/` : '/';
}

function joinPath(...parts) {
  const cleaned = parts
    .filter(part => part !== undefined && part !== null && String(part).trim() !== '')
    .map(part => String(part).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return cleaned ? `/${cleaned}/` : '/';
}

function outputPathFor(urlPath) {
  const normalized = normalizePath(urlPath);
  return normalized === '/' ? 'public/index.html' : `public${normalized}index.html`;
}

function breadcrumbItem(title, url) {
  return { title, url: normalizePath(url) };
}
```

### 全局数据计算

```javascript
function buildNav(config, contentTypes) {
  const navItems = [];
  for (const page of config.pages || []) {
    if (page in (contentTypes.types || {})) {
      const typeDef = contentTypes.types[page];
      navItems.push({ title: typeDef.label || page, url: joinPath(page), active: false, children: [] });
    } else {
      navItems.push({ title: page.charAt(0).toUpperCase() + page.slice(1), url: joinPath(page), active: false, children: [] });
    }
  }
  return navItems;
}

function buildPagination(allItems, config, contentTypes) {
  const plans = {};
  const defaultPerPage = config.per_page || 10;
  for (const [typeKey, items] of Object.entries(allItems)) {
    const typeDef = (contentTypes.types || {})[typeKey] || {};
    const perPage = typeDef.per_page || defaultPerPage;
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    plans[typeKey] = { items, perPage, totalPages, baseUrl: joinPath(typeKey) };
  }
  return plans;
}

function buildPrevNext(allItems) {
  const map = {};
  for (const [typeKey, items] of Object.entries(allItems)) {
    for (let i = 0; i < items.length; i++) {
      const prev = items[i + 1] || null;
      const next = items[i - 1] || null;
      map[`${typeKey}/${items[i].slug}`] = {
        prev: prev ? itemSummary(prev) : null,
        next: next ? itemSummary(next) : null
      };
    }
  }
  return map;
}

function itemSummary(item) {
  return {
    title: item.title,
    url: item.url,
    date: item.date,
    dateDisplay: item.dateDisplay,
    cover: item.cover,
    type: item.type
  };
}
```

### 模板渲染

```javascript
function renderTemplate(template, data) {
  let html = template;
  // 支持 ${key} 与 ${object.nested.path} 形式；实际生成器还必须支持循环、条件、HTML 转义、raw HTML、属性安全输出
  html = html.replace(/\$\{([^}]+)\}/g, (match, path) => {
    const value = path.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), data);
    return value != null ? String(value) : '';
  });
  return html;
}

function computeHash(contentFile, templateNames, tokens, config, interactions = { interactions: [] }) {
  const parts = [];
  if (existsSync(contentFile)) parts.push(readFileSync(contentFile));
  for (const name of templateNames) {
    if (templates[name]) parts.push(Buffer.from(templates[name]));
  }
  parts.push(Buffer.from(JSON.stringify(tokens, null, 0)));
  parts.push(Buffer.from(JSON.stringify({ site: config.site, pages: config.pages, per_page: config.per_page })));
  parts.push(Buffer.from(JSON.stringify(interactions)));
  for (const file of listAssetFiles(join(PIPELINE_DIR, 'assets'))) {
    parts.push(readFileSync(file));
  }
  return createHash('sha256').update(Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)))).digest('hex');
}

function listAssetFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listAssetFiles(path));
    else out.push(path);
  }
  return out.sort();
}
```

### 页面渲染（列表/详情/单页/首页）

```javascript
function renderAllPages(allItems, nav, paginationPlans, prevNextMap, config, tokens, contentTypes, templates, interactions, cache, fresh) {
  const outputs = [];
  const buildTime = new Date().toISOString();

  // 列表页
  for (const [typeKey, plan] of Object.entries(paginationPlans)) {
    const typeDef = contentTypes.types[typeKey];
    for (let pageNum = 1; pageNum <= plan.totalPages; pageNum++) {
      const start = (pageNum - 1) * plan.perPage;
      const pageItems = plan.items.slice(start, start + plan.perPage);
      const pagination = buildPaginationData(pageNum, plan.totalPages, plan.baseUrl);
      const pageUrl = pageNum > 1 ? joinPath(plan.baseUrl, 'page', pageNum) : plan.baseUrl;
      const breadcrumb = [
        breadcrumbItem(config.site.title, '/'),
        breadcrumbItem(typeDef.label, plan.baseUrl)
      ];
      const data = {
        site: config.site, nav, page: { type: 'list', title: typeDef.label,
          url: pageUrl, breadcrumb },
        pagination, items: pageItems.map(itemSummary), tokens, build_time: buildTime
      };
      const outputPath = outputPathFor(pageUrl);
      const contentFile = join(SITE_ROOT, typeDef.dir);
      writeOutput(outputPath, renderTemplate(templates[`list-${typeKey}`], data), fresh, cache, contentFile, [`list-${typeKey}`, 'base'], interactions);
      outputs.push(outputPath);
    }
  }

  // 详情页
  for (const [typeKey, items] of Object.entries(allItems)) {
    for (const item of items) {
      const pn = prevNextMap[`${typeKey}/${item.slug}`] || {};
      const breadcrumb = [
        breadcrumbItem(config.site.title, '/'),
        breadcrumbItem(contentTypes.types[typeKey].label, joinPath(typeKey)),
        breadcrumbItem(item.title, item.url)
      ];
      const data = {
        site: config.site, nav, page: { type: 'detail', title: item.title, url: item.url, breadcrumb },
        item, prev_item: pn.prev, next_item: pn.next, tokens, build_time: buildTime
      };
      const outputPath = outputPathFor(item.url);
      writeOutput(outputPath, renderTemplate(templates[`detail-${typeKey}`], data), fresh, cache, join(SITE_ROOT, contentTypes.types[typeKey].dir), [`detail-${typeKey}`, 'base'], interactions);
      outputs.push(outputPath);
    }
  }

  // 首页
  const latestByType = {};
  for (const [typeKey, items] of Object.entries(allItems)) {
    latestByType[typeKey] = items.slice(0, 3);
  }
  const indexData = {
    site: config.site, nav, page: { type: 'index', title: config.site.title, url: '/',
      breadcrumb: [breadcrumbItem(config.site.title, '/')] },
    latest_by_type: latestByType, tokens, build_time: buildTime
  };
  const indexOutputPath = outputPathFor('/');
  writeOutput(indexOutputPath, renderTemplate(templates.index, indexData), fresh, cache, SITE_ROOT, ['index', 'base'], interactions);
  outputs.push(indexOutputPath);

  return outputs;
}
```

### 资源拷贝、Feed、Sitemap、404

```javascript
function copyAssets() {
  const src = join(PIPELINE_DIR, 'assets');
  const dst = join(PUBLIC_DIR, 'assets');
  if (existsSync(src)) {
    cpSync(src, dst, { recursive: true, force: true });
  }
}

function generateFeeds(allItems, config) {
  const posts = allItems.post || allItems.posts || [];
  if (posts.length === 0) return;
  // RSS 2.0
  const rss = buildRss(posts, config);
  writeFileSync(join(PUBLIC_DIR, 'feed.xml'), rss, 'utf-8');
  // JSON Feed 1.1
  const jsonFeed = buildJsonFeed(posts, config);
  writeFileSync(join(PUBLIC_DIR, 'feed.json'), JSON.stringify(jsonFeed, null, 2), 'utf-8');
}

function generateSitemap(outputs, config) {
  const siteUrl = config.site.url;
  const urls = outputs
    .filter(o => o.startsWith('public/'))
    .map(o => {
      let path = o.slice(7);
      if (path.endsWith('/index.html')) path = path.slice(0, -11);
      if (path === '') path = '/';
      return `  <url><loc>${siteUrl}${path}</loc></url>`;
    });
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
  writeFileSync(join(PUBLIC_DIR, 'sitemap.xml'), sitemap, 'utf-8');
}

function generate404(config, tokens, templates, nav) {
  const data = {
    site: config.site, nav, page: { type: 'page', title: '404 - Page Not Found', url: '/404/',
      breadcrumb: [breadcrumbItem(config.site.title, '/'), breadcrumbItem('404', '/404/')] },
    item: { title: 'Page Not Found', bodyHtml: "<p>The page you're looking for doesn't exist.</p>" },
    tokens, build_time: new Date().toISOString()
  };
  const html = renderTemplate(templates.page, data);
  writeFileSync(join(PUBLIC_DIR, '404.html'), html, 'utf-8');
}
```

### 缓存写入

```javascript
function writeOutput(outputPath, html, fresh, cache, contentFile, templateNames, interactions) {
  const relPath = outputPath.replace(/^public\//, '');
  const hash = computeHash(contentFile, templateNames, tokens, config, interactions);
  const cached = (cache.outputs || {})[relPath];
  if (!fresh && cached && cached.hash === hash) return; // 缓存命中
  const fullPath = join(SITE_ROOT, outputPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, html, 'utf-8');
  cache.outputs = cache.outputs || {};
  cache.outputs[relPath] = {
    hash,
    inputs: [contentFile, ...templateNames.map(n => `.xiaoyi-ssg/templates/${n}.html`), '.xiaoyi-ssg/interactions.manifest.json', '.xiaoyi-ssg/assets/**'],
    template_names: templateNames
  };
}

function saveCache(cache) {
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

function printSummary(outputs) {
  console.log(`Build complete: ${outputs.length} pages`);
  console.log(`Output: ${PUBLIC_DIR}`);
}

// 入口
const fresh = process.argv.includes('--fresh');
build(fresh).catch(err => { console.error(err); process.exit(1); });
```

---

## dev.js — 开发服务器

### 核心结构

```javascript
#!/usr/bin/env node
/**
 * xiaoyi-ssg 开发服务器 - 实时渲染 + Live Reload
 */
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, extname, relative } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import chokidar from 'chokidar';

const PIPELINE_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = dirname(PIPELINE_DIR);
const PUBLIC_DIR = join(SITE_ROOT, 'public');

const SSE_SCRIPT = `<script>const __sfEs=new EventSource('/__live');__sfEs.addEventListener('reload',()=>location.reload());</script>`;

// 解析端口
let port = 3000;
const portArg = process.argv.indexOf('--port');
if (portArg !== -1 && process.argv[portArg + 1]) {
  port = parseInt(process.argv[portArg + 1], 10);
}

// SSE 客户端连接
const sseClients = new Set();

function sendReloadAll() {
  for (const res of sseClients) {
    res.write('event: reload\ndata: {}\n\n');
  }
}

// 端口自动递增
function startServer(port) {
  const server = createServer((req, res) => {
    // SSE 端点
    if (req.url === '/__live') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write('retry: 1000\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // 静态文件服务
    let filePath = join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
    if (!existsSync(filePath)) {
      // 尝试 index.html
      filePath = join(PUBLIC_DIR, req.url, 'index.html');
    }
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const content = readFileSync(filePath, 'utf-8');
    const ext = extname(filePath);
    const mimeTypes = {
      '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
      '.json': 'application/json', '.xml': 'application/xml', '.png': 'image/png',
      '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
    };

    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });

    // HTML 注入 SSE 脚本
    if (ext === '.html') {
      const injected = content.includes('</body>')
        ? content.replace('</body>', `${SSE_SCRIPT}</body>`)
        : content + SSE_SCRIPT;
      res.end(injected);
    } else {
      res.end(content);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      throw err;
    }
  });

  server.listen(port, () => {
    console.log(`\n  Site Forge dev server running at http://localhost:${port}\n`);
    console.log(`  Watching for changes...`);
  });
}

// 初次构建
console.log('Building...');
execSync('node render.js', { cwd: PIPELINE_DIR, stdio: 'inherit' });

// 启动服务器
startServer(port);

// 文件监听
const watcher = chokidar.watch([
  'source/**/*.md',
  '.xiaoyi-ssg/templates/**',
  '.xiaoyi-ssg/assets/**',
  '.xiaoyi-ssg/interactions.manifest.json',
  '.xiaoyi-ssg-design-tokens.json',
  'config.yml',
  'source/_media/**'
], { cwd: SITE_ROOT, ignoreInitial: true });

let buildTimeout = null;
watcher.on('all', (event, path) => {
  console.log(`\n  Change detected: ${path}`);
  // 防抖
  if (buildTimeout) clearTimeout(buildTimeout);
  buildTimeout = setTimeout(() => {
    console.log('  Rebuilding...');
    try {
      execSync('node render.js', { cwd: PIPELINE_DIR, stdio: 'inherit' });
      console.log('  Reload triggered');
      sendReloadAll();
    } catch (e) {
      console.error('  Build error:', e.message);
    }
  }, 300);
});
```

---

## preview.js — 静态预览服务器

```javascript
#!/usr/bin/env node
/**
 * xiaoyi-ssg 静态预览服务器（无 watch）
 */
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const PIPELINE_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = dirname(PIPELINE_DIR);
const PUBLIC_DIR = join(SITE_ROOT, 'public');

let port = 8000;
const portArg = process.argv.indexOf('--port');
if (portArg !== -1 && process.argv[portArg + 1]) {
  port = parseInt(process.argv[portArg + 1], 10);
}

const server = createServer((req, res) => {
  let filePath = join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  if (!existsSync(filePath)) {
    filePath = join(PUBLIC_DIR, req.url, 'index.html');
  }
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const content = readFileSync(filePath);
  const ext = extname(filePath);
  const mimeTypes = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.json': 'application/json', '.xml': 'application/xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
  };
  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  res.end(content);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    server.listen(++port);
  } else {
    throw err;
  }
});

server.listen(port, () => {
  console.log(`\n  Preview server running at http://localhost:${port}\n`);
});
```

---

## 模板数据契约

每个模板接收统一数据结构（`renderTemplate` 的 `data` 参数）：

```javascript
{
  site: config.site,                    // {title, subtitle, author, email, language, timezone, url, description}
  nav: navItems,                        // [{title, url, active, children}]
  page: {
    type: "list|detail|page|index",
    title: "...",
    url: "/blog/",
    breadcrumb: [{title: "Home", url: "/"}, {title: "Blog", url: "/blog/"}],
  },
  pagination: {                         // 仅列表页
    current: 1,
    total: 5,
    base_url: "/blog/",
    pages: [1, 2, 3, "...", 5],
    prev_url: null,
    next_url: "/blog/page/2/"
  },
  items: [...],                         // 列表页：内容摘要数组
  item: {...},                          // 详情页：单条内容完整数据（含 body_html）
  prev_item: {...},                     // 详情页：上一篇
  next_item: {...},                     // 详情页：下一篇
  latest_by_type: {...},                // 首页：各类型最新项
  tokens: tokens,                       // 设计 token（极少数运行时判断用）
  build_time: "ISO8601",
}
```

内容项标准字段：

```javascript
{
  type: "post",
  slug: "hello-world",
  title: "Hello World",
  date: "2025-01-15",
  dateDisplay: "2025-01-15",
  tags: ["tag1", "tag2"],
  categories: ["cat1"],
  cover: "/images/cover.jpg",
  excerpt: "摘要文本...",
  url: "/blog/hello-world/",
  bodyHtml: "<p>正文 HTML...</p>",
  customFields: {...}
}
```

---

## 缓存文件格式

`.xiaoyi-ssg-cache.json`：

```json
{
  "version": 1,
  "outputs": {
    "blog/hello-world/index.html": {
      "hash": "sha256hex",
      "inputs": [
        "source/_posts/2025-01-15-hello-world.md",
        ".xiaoyi-ssg/templates/detail-post.html",
        ".xiaoyi-ssg/templates/base.html"
      ],
      "template_names": ["detail-post", "base"]
    }
  }
}
```

---

## 生成时的占位符替换

AI 生成 `render.js` 时，应替换文件头部的元数据：

```javascript
/**
 * xiaoyi-ssg 渲染管线 - 自动生成，请勿手动修改
 * 重新生成：/xiaoyi-ssg → 调整风格/内容类型 → 重新生成管线
 * 生成时间: {{GENERATED_AT}}          → 替换为 ISO8601 时间
 * 主题参考: {{THEME_REF}}              → 替换为 reference-url|custom
 * Tokens Hash: {{TOKENS_HASH}}         → 替换为 tokens 对象的 SHA256
 * Content-Types Hash: {{CONTENT_TYPES_HASH}}  → 替换为 content-types 对象的 SHA256
 */
```

---

## 关键生成约束

1. **ESM 模块** — 所有 `.js` 文件使用 `import`/`export`，`package.json` 含 `"type": "module"`
2. **三文件分离** — `render.js`（构建）、`dev.js`（开发）、`preview.js`（预览）各自独立
3. **依赖默认最小** — 默认使用 `js-yaml`、`marked`、`chokidar`；必要交互需要额外包时必须固定版本并记录到 `interactions.manifest.json`
4. **模板能力完整** — 支持 HTML 转义、raw HTML、条件、数组循环、属性安全输出和 `data-*` 交互钩子
5. **确定性** — 相同输入产生相同输出（缓存哈希机制）
6. **增量构建** — 哈希缓存机制，未变文件不重新渲染
7. **浏览器交互** — build 产物必须能加载 `assets/script.js` 与所需模块；搜索/筛选/灯箱/表单等交互不得依赖 dev server
8. **dev server 注入** — 仅 dev 模式在 HTML `</body>` 前注入 SSE 脚本，build 产物不含
9. **端口自动递增** — dev.js / preview.js 端口被占用时自动 +1 重试
10. **防抖** — dev.js 文件变更后 300ms 防抖，避免连续触发多次构建
