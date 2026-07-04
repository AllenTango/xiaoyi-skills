# render.js / dev.js 规格文档

此文档定义 AI 生成渲染管线时应产出的 Node.js 脚本完整规格。AI 按此规格生成代码，写入用户项目的 `.xiaoyi-ssg/`。

---

## 技术约束

- **Node.js 18+**（LTS，内置 `fetch`、`fs.cpSync`）
- **ESM 模块系统**（`"type": "module"`，使用 `import`/`export`）
- **路径推导**：`render.js`、`dev.js` 必须从 `import.meta.url` 推导 `PIPELINE_DIR`，再用 `dirname(PIPELINE_DIR)` 推导 `SITE_ROOT`。不要用 `process.cwd()` 作为站点根；这样脚本既可通过 `cd .xiaoyi-ssg && npm run build/dev` 运行，也可从站点根用 `node .xiaoyi-ssg/*.js` 运行。
- 依赖：`js-yaml`（YAML 解析）、`marked`（Markdown → HTML）、`chokidar`（文件监听，仅 dev.js）、`eta`（模板引擎）
- 模板引擎：使用 `eta`（~2KB，ESM，支持 HTML 转义、raw HTML、条件、数组循环、异步、自定义过滤器）
- 两个独立文件：`render.js`（构建）、`dev.js`（开发）
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
import { Eta } from 'eta';

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

function loadInteractionsManifest() {
  if (!existsSync(INTERACTIONS_MANIFEST)) return { version: 1, interactions: [] };
  return JSON.parse(readFileSync(INTERACTIONS_MANIFEST, 'utf-8'));
}

// --- 运行时校验 ---

class ValidationError extends Error {
  constructor(field, message) {
    super(`${field}: ${message}`);
    this.name = 'ValidationError';
    this.field = field;
  }
}

function validateRequired(obj, fields, prefix) {
  for (const field of fields) {
    if (!(field in obj)) {
      throw new ValidationError(`${prefix}.${field}`, '缺少必需字段');
    }
  }
}

function validateType(value, type, field) {
  if (type === 'string' && typeof value !== 'string') {
    throw new ValidationError(field, `期望 string，实际 ${typeof value}`);
  }
  if (type === 'number' && typeof value !== 'number') {
    throw new ValidationError(field, `期望 number，实际 ${typeof value}`);
  }
  if (type === 'boolean' && typeof value !== 'boolean') {
    throw new ValidationError(field, `期望 boolean，实际 ${typeof value}`);
  }
  if (type === 'array' && !Array.isArray(value)) {
    throw new ValidationError(field, `期望 array，实际 ${typeof value}`);
  }
  if (type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
    throw new ValidationError(field, `期望 object，实际 ${typeof value}`);
  }
}

function validatePattern(value, pattern, field) {
  if (typeof value === 'string' && !new RegExp(pattern).test(value)) {
    throw new ValidationError(field, `不匹配模式 ${pattern}，实际值: ${value}`);
  }
}

function validateDesignTokens(tokens) {
  validateRequired(tokens, ['version', 'theme_ref', 'theme_manifesto_hash', 'tokens', 'darkMode', 'seed'], 'design-tokens');
  validateType(tokens.version, 'number', 'design-tokens.version');
  validateType(tokens.seed, 'number', 'design-tokens.seed');
  validatePattern(tokens.theme_manifesto_hash, '^sha256:[a-f0-9]{64}$', 'design-tokens.theme_manifesto_hash');

  const t = tokens.tokens;
  validateRequired(t, ['color', 'typography', 'layout', 'component', 'motion'], 'design-tokens.tokens');

  // Color
  const colorRequired = ['background', 'backgroundDark', 'text', 'textDark', 'accent', 'accentHover', 'muted', 'border', 'borderDark', 'focus', 'error', 'success'];
  validateRequired(t.color, colorRequired, 'design-tokens.tokens.color');

  // Typography
  validateRequired(t.typography, ['fontDisplay', 'fontBody', 'fontMono', 'scale', 'lineLength', 'letterSpacing'], 'design-tokens.tokens.typography');
  validatePattern(t.typography.lineLength, '^[\\d.]+ch$', 'design-tokens.tokens.typography.lineLength');

  // Scale
  const scaleRequired = ['h1', 'h2', 'h3', 'body', 'small', 'micro'];
  validateRequired(t.typography.scale, scaleRequired, 'design-tokens.tokens.typography.scale');
  for (const key of scaleRequired) {
    validatePattern(t.typography.scale[key], '^(clamp\\([^)]+\\)|[\\d.]+(rem|em|px))\\s*/\\s*[\\d.]+$', `design-tokens.tokens.typography.scale.${key}`);
  }

  // Layout
  validateRequired(t.layout, ['containerMax', 'headerHeight', 'footerHeight', 'sidebarWidth', 'gridColumns', 'gutter', 'rhythm', 'radius'], 'design-tokens.tokens.layout');
  validateType(t.layout.gridColumns, 'number', 'design-tokens.tokens.layout.gridColumns');

  // Component
  validateRequired(t.component, ['card', 'cardMedia', 'nav', 'button', 'form', 'blockquote', 'code', 'pre', 'media', 'pagination', 'breadcrumb'], 'design-tokens.tokens.component');

  // Motion
  validateRequired(t.motion, ['entrance', 'hover', 'focus', 'transitionFast', 'transitionBase'], 'design-tokens.tokens.motion');
  validatePattern(t.motion.transitionFast, '^[\\d.]+ms\\s+[a-z-]+$', 'design-tokens.tokens.motion.transitionFast');
  validatePattern(t.motion.transitionBase, '^[\\d.]+ms\\s+[a-z-\\(\\)\\d.,]+$', 'design-tokens.tokens.motion.transitionBase');

  // DarkMode
  validateRequired(tokens.darkMode, ['color'], 'design-tokens.darkMode');
  validateRequired(tokens.darkMode.color, ['background', 'text', 'border', 'muted'], 'design-tokens.darkMode.color');
}

function validateConfig(config) {
  validateRequired(config, ['site', 'pages', 'per_page'], 'config');
  validateRequired(config.site, ['title', 'author'], 'config.site');
  validateType(config.pages, 'array', 'config.pages');
  if (config.pages.length === 0) {
    throw new ValidationError('config.pages', '至少需要一个内容类型');
  }
  validateType(config.per_page, 'number', 'config.per_page');
  if (config.per_page < 1 || config.per_page > 100) {
    throw new ValidationError('config.per_page', '必须在 1-100 之间');
  }
}

function validateContentTypes(contentTypes) {
  validateRequired(contentTypes, ['version', 'types', 'nav_order'], 'content-types');
  validateType(contentTypes.types, 'object', 'content-types.types');
  validateType(contentTypes.nav_order, 'array', 'content-types.nav_order');

  for (const [typeKey, typeDef] of Object.entries(contentTypes.types)) {
    const prefix = `content-types.types.${typeKey}`;
    validateRequired(typeDef, ['label', 'dir', 'fields', 'list_template', 'detail_template'], prefix);
    validateType(typeDef.fields, 'object', `${prefix}.fields`);

    for (const [fieldName, fieldDef] of Object.entries(typeDef.fields)) {
      validateRequired(fieldDef, ['type'], `${prefix}.fields.${fieldName}`);
      if (!['string', 'datetime', 'date', 'boolean', 'string[]', 'url', 'number', 'object'].includes(fieldDef.type)) {
        throw new ValidationError(`${prefix}.fields.${fieldName}.type`, `不支持的类型: ${fieldDef.type}`);
      }
    }
  }
}

function validateAll(config, tokens, contentTypes) {
  const errors = [];
  try { validateConfig(config); } catch (e) { errors.push(e.message); }
  try { validateDesignTokens(tokens); } catch (e) { errors.push(e.message); }
  try { validateContentTypes(contentTypes); } catch (e) { errors.push(e.message); }

  if (errors.length > 0) {
    console.error('\n校验失败：');
    for (const err of errors) {
      console.error(`  ✗ ${err}`);
    }
    process.exit(1);
  }
}

// 初始化 Eta 模板引擎
function initTemplates() {
  return new Eta({
    views: join(PIPELINE_DIR, 'templates'),
    cache: true,
    rmWhitespace: false,
  });
}

// 带布局继承的渲染
function renderWithLayout(eta, templateName, data) {
  const content = eta.render(templateName, data);
  return eta.render('base', { ...data, body: content });
}

// 主构建流程
async function build(fresh = false) {
  const config = loadConfig();
  const tokens = loadTokens();
  const contentTypes = loadContentTypes();
  const interactions = loadInteractionsManifest();
  const cache = loadCache();

  // 启动时校验
  validateAll(config, tokens, contentTypes);

  const eta = initTemplates();

  // 1. 扫描内容
  const allItems = scanContent(contentTypes);

  // 2. 计算全局数据
  const nav = buildNav(config, contentTypes);
  const paginationPlans = buildPagination(allItems, config, contentTypes);
  const prevNextMap = buildPrevNext(allItems);
  const interactionData = buildInteractionData(allItems, contentTypes, interactions, config);

  // 3. 渲染各页面（包含交互钩子）
  const outputs = renderAllPages(allItems, nav, paginationPlans, prevNextMap, config, tokens, contentTypes, eta, interactions, cache, fresh);

  // 4. 复制资源并写入交互数据
  copyAssets();
  writeInteractionData(interactionData);

  // 5. 生成附加产物
  generateFeeds(allItems, config);
  generateSitemap(outputs, config);
  generate404(config, tokens, eta, nav);

  // 6. 可选图片处理
  await processImages(config, pipelineManifest);

  // 7. 保存缓存
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

  // 计算 slug（支持 Unicode）
  let slug = basename(filePath, '.md');
  slug = slug.replace(/^\d{4}-\d{2}-\d{2}-/, ''); // 移除日期前缀
  slug = generateUniqueSlug(slug, typeKey);

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

// Slug 生成：支持 Unicode + URL 安全
const slugSeen = new Map(); // typeKey -> Set of slugs

function generateUniqueSlug(rawSlug, typeKey) {
  // 保留 Unicode 字符，转换为 URL 安全格式
  // 中文/日文等保留原字符，空格转连字符，移除特殊字符
  let slug = rawSlug
    .toLowerCase()
    .replace(/\s+/g, '-')           // 空格 → 连字符
    .replace(/[^\p{L}\p{N}\-]/gu, '') // 保留字母、数字、连字符，移除其他
    .replace(/-+/g, '-')            // 合并连续连字符
    .replace(/^-|-$/g, '');          // 移除首尾连字符

  if (!slug) slug = 'untitled';

  // 碰撞检测：同类型内 slug 必须唯一
  if (!slugSeen.has(typeKey)) {
    slugSeen.set(typeKey, new Set());
  }
  const seen = slugSeen.get(typeKey);

  if (!seen.has(slug)) {
    seen.add(slug);
    return slug;
  }

  // 碰撞：追加数字后缀
  let counter = 2;
  while (seen.has(`${slug}-${counter}`)) counter++;
  const uniqueSlug = `${slug}-${counter}`;
  seen.add(uniqueSlug);
  console.warn(`Warning: slug collision for "${rawSlug}" in ${typeKey}, using "${uniqueSlug}"`);
  return uniqueSlug;
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

### 模板引擎：Eta

使用 `eta` 作为模板引擎，提供完整的模板语法支持：

```javascript
import { Eta } from 'eta';

const eta = new Eta({
  views: join(PIPELINE_DIR, 'templates'),
  cache: true,
  rmWhitespace: false,
  escapeFunction: eta.escapeXml,  // 默认 HTML 转义
});

// 同步渲染
function renderTemplate(templateName, data) {
  return eta.render(templateName, data);
}

// 带布局继承的渲染
function renderWithLayout(layoutName, templateName, data) {
  const content = eta.render(templateName, data);
  return eta.render(layoutName, { ...data, body: content });
}
```

### 模板语法

#### 变量输出

```html
<!-- HTML 转义输出（默认） -->
<title><%= it.site.title %></title>

<!-- Raw HTML 输出（不转义） -->
<article><%- it.item.bodyHtml %></article>

<!-- 属性安全输出 -->
<a href="<%= it.item.url %>" data-type="<%= it.item.type %>">
```

#### 条件渲染

```html
<% if (it.item.cover) { %>
  <img src="<%= it.item.cover %>" alt="<%= it.item.title %>">
<% } %>

<% if (it.pagination.total > 1) { %>
  <nav aria-label="Pagination">...</nav>
<% } %>

<% if (it.prev_item) { %>
  <a href="<%= it.prev_item.url %>">上一篇: <%= it.prev_item.title %></a>
<% } else { %>
  <span aria-disabled="true">已是第一篇</span>
<% } %>
```

#### 循环

```html
<!-- 列表页卡片 -->
<% for (const item of it.items) { %>
  <article class="card">
    <h2><a href="<%= item.url %>"><%= item.title %></a></h2>
    <time><%= item.dateDisplay %></time>
    <p><%= item.excerpt %></p>
  </article>
<% } %>

<!-- 面包屑（跳过第一项） -->
<nav aria-label="Breadcrumb">
  <ol class="breadcrumb">
    <% for (const [i, crumb] of it.page.breadcrumb.entries()) { %>
      <li><a href="<%= crumb.url %>"><%= crumb.title %></a></li>
    <% } %>
  </ol>
</nav>

<!-- 分页 -->
<% if (it.pagination) { %>
  <nav aria-label="Pagination">
    <% if (it.pagination.prev_url) { %>
      <a href="<%= it.pagination.prev_url %>">上一页</a>
    <% } %>
    <% for (const p of it.pagination.pages) { %>
      <% if (p === '...') { %>
        <span class="ellipsis">...</span>
      <% } else if (p === it.pagination.current) { %>
        <span class="current" aria-current="page"><%= p %></span>
      <% } else { %>
        <a href="<%= it.pagination.base_url + (p > 1 ? 'page/' + p + '/' : '') %>"><%= p %></a>
      <% } %>
    <% } %>
    <% if (it.pagination.next_url) { %>
      <a href="<%= it.pagination.next_url %>">下一页</a>
    <% } %>
  </nav>
<% } %>
```

#### 辅助函数（在 data 中注入）

```javascript
// 渲染前注入辅助函数到 data
const templateData = {
  ...data,
  // 路径工具
  joinPath: (...parts) => joinPath(...parts),
  normalizePath: (p) => normalizePath(p),
  // 格式化
  formatDate: (d) => formatDate(d),
  truncate: (text, len = 200) => text.length > len ? text.slice(0, len) + '...' : text,
  // 统计
  typeCount: (typeKey) => (allItems[typeKey] || []).length,
};
```

#### 布局继承

`base.html` 通过 `<%- it.body %>` 插入子模板内容：

```html
<!-- base.html -->
<!DOCTYPE html>
<html lang="<%= it.site.language || 'zh' %>">
<head>
  <meta charset="UTF-8">
  <title><%= it.page.title || it.site.title %></title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <%- include('./partials/header', it) %>
  <main role="main">
    <%- it.body %>
  </main>
  <%- include('./partials/footer', it) %>
  <script src="/assets/script.js"></script>
</body>
</html>
```

function computeHash(contentFile, templateNames, tokens, config, interactions = { interactions: [] }) {
  const parts = [];
  // 内容文件
  if (existsSync(contentFile)) parts.push(readFileSync(contentFile));
  // 模板文件
  for (const name of templateNames) {
    const tplPath = join(PIPELINE_DIR, 'templates', `${name}.html`);
    if (existsSync(tplPath)) parts.push(readFileSync(tplPath));
  }
  // 设计 tokens
  parts.push(Buffer.from(JSON.stringify(tokens, null, 0)));
  // 配置（关键字段）
  parts.push(Buffer.from(JSON.stringify({ site: config.site, pages: config.pages, per_page: config.per_page })));
  // 交互 manifest
  parts.push(Buffer.from(JSON.stringify(interactions)));
  // 交互模块 + 数据文件（interactions/*.js, data/*.json）
  const interactionDirs = [
    join(PIPELINE_DIR, 'assets', 'interactions'),
    join(PIPELINE_DIR, 'assets', 'data'),
  ];
  for (const dir of interactionDirs) {
    for (const file of listAssetFiles(dir)) {
      parts.push(readFileSync(file));
    }
  }
  // 其他 assets（style.css, script.js 等）
  const assetsDir = join(PIPELINE_DIR, 'assets');
  if (existsSync(assetsDir)) {
    for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
      if (entry.isFile()) {
        parts.push(readFileSync(join(assetsDir, entry.name)));
      }
    }
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
import { Eta } from 'eta';

// 初始化 Eta 模板引擎
function initTemplates() {
  return new Eta({
    views: join(PIPELINE_DIR, 'templates'),
    cache: true,
    rmWhitespace: false,
  });
}

function renderWithLayout(eta, templateName, data) {
  const content = eta.render(templateName, data);
  return eta.render('base', { ...data, body: content });
}

function renderAllPages(allItems, nav, paginationPlans, prevNextMap, config, tokens, contentTypes, eta, interactions, cache, fresh) {
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
      const html = renderWithLayout(eta, `list-${typeKey}`, data);
      writeOutput(outputPath, html, fresh, cache, contentFile, [`list-${typeKey}`, 'base'], interactions);
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
      const html = renderWithLayout(eta, `detail-${typeKey}`, data);
      writeOutput(outputPath, html, fresh, cache, join(SITE_ROOT, contentTypes.types[typeKey].dir), [`detail-${typeKey}`, 'base'], interactions);
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
  const indexHtml = renderWithLayout(eta, 'index', indexData);
  writeOutput(indexOutputPath, indexHtml, fresh, cache, SITE_ROOT, ['index', 'base'], interactions);
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

function generate404(config, tokens, eta, nav) {
  const data = {
    site: config.site, nav, page: { type: 'page', title: '404 - Page Not Found', url: '/404/',
      breadcrumb: [breadcrumbItem(config.site.title, '/'), breadcrumbItem('404', '/404/')] },
    item: { title: 'Page Not Found', bodyHtml: "<p>The page you're looking for doesn't exist.</p>" },
    tokens, build_time: new Date().toISOString()
  };
  const html = renderWithLayout(eta, 'page', data);
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

// --- 可选：图片处理管线 ---

/**
 * 图片处理功能（可选，需安装 sharp：npm install sharp）
 *
 * 通过 interactions.manifest.json 或 pipeline-manifest.json 启用：
 * { "image_processing": { "enabled": true, "formats": ["webp"], "sizes": [400, 800, 1200] } }
 *
 * 功能：
 * 1. 扫描 source/_media/ 和内容中引用的图片
 * 2. 生成响应式尺寸（sm/md/lg）
 * 3. 转换为 WebP/AVIF（可选）
 * 4. 生成 blur placeholder（base64 低质量占位图）
 * 5. 输出到 public/assets/images/（带哈希文件名）
 */

async function processImages(config, pipelineManifest) {
  const imgConfig = pipelineManifest?.image_processing;
  if (!imgConfig?.enabled) return;

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('Warning: image processing enabled but sharp not installed. Run: npm install sharp');
    return;
  }

  const sourceMediaDir = join(SITE_ROOT, 'source', '_media');
  const outputDir = join(PUBLIC_DIR, 'assets', 'images');
  mkdirSync(outputDir, { recursive: true });

  const formats = imgConfig.formats || ['webp'];
  const sizes = imgConfig.sizes || [400, 800, 1200];

  if (!existsSync(sourceMediaDir)) return;

  const imageFiles = readdirSync(sourceMediaDir).filter(f =>
    /\.(jpg|jpeg|png|gif|svg)$/i.test(f)
  );

  for (const file of imageFiles) {
    const inputPath = join(sourceMediaDir, file);
    const ext = extname(file).toLowerCase();
    const name = basename(file, ext);
    const stats = statSync(inputPath);

    // 跳过小文件（< 10KB）和 SVG
    if (stats.size < 10240 || ext === '.svg') {
      cpSync(inputPath, join(outputDir, file));
      continue;
    }

    try {
      const image = sharp(inputPath);
      const metadata = await image.metadata();

      // 生成响应式尺寸
      for (const size of sizes) {
        if (metadata.width && metadata.width <= size) continue;

        const resized = sharp(inputPath).resize({ width: size, withoutEnlargement: true });

        // 原始格式
        const origOut = join(outputDir, `${name}-${size}${ext}`);
        await resized.toFile(origOut);

        // WebP
        if (formats.includes('webp')) {
          const webpOut = join(outputDir, `${name}-${size}.webp`);
          await resized.webp({ quality: 80 }).toFile(webpOut);
        }
      }

      // 生成 blur placeholder
      const blurBuffer = await sharp(inputPath)
        .resize(20, 20, { fit: 'inside' })
        .blur(3)
        .webp({ quality: 20 })
        .toBuffer();

      const blurData = `data:image/webp;base64,${blurBuffer.toString('base64')}`;

      // 写入 blur metadata
      const metaOut = join(outputDir, `${name}.json`);
      writeFileSync(metaOut, JSON.stringify({
        width: metadata.width,
        height: metadata.height,
        blur: blurData,
        sizes: sizes.filter(s => !metadata.width || metadata.width > s),
      }, null, 2));

    } catch (e) {
      console.warn(`Warning: failed to process image ${file}: ${e.message}`);
      // 降级：直接复制
      cpSync(inputPath, join(outputDir, file));
    }
  }
}

// 入口
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('render.js') ||
  process.argv[1].endsWith('render')
);
if (isDirectRun) {
  const fresh = process.argv.includes('--fresh');
  build(fresh).catch(err => { console.error(err); process.exit(1); });
}

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
import { build } from './render.js';
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
      '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
      '.woff2': 'font/woff2', '.woff': 'font/woff'
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

// 初次构建（进程内执行，避免 execSync 开销）
console.log('Building...');
build(false).then(() => {
  // 启动服务器
  startServer(port);
}).catch(err => {
  console.error('Initial build failed:', err);
  process.exit(1);
});

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
let isBuilding = false;

watcher.on('all', (event, path) => {
  console.log(`\n  Change detected: ${path}`);
  // 防抖 + 构建锁
  if (buildTimeout) clearTimeout(buildTimeout);
  if (isBuilding) return;
  buildTimeout = setTimeout(async () => {
    isBuilding = true;
    console.log('  Rebuilding...');
    try {
      await build(false);
      console.log('  Reload triggered');
      sendReloadAll();
    } catch (e) {
      console.error('  Build error:', e.message);
    } finally {
      isBuilding = false;
    }
  }, 300);
});
```

### render.js 导出

render.js 必须导出 `build` 函数供 dev.js 使用：

```javascript
// render.js 末尾
export { build };

// 入口（仅直接运行时执行）
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('render.js') ||
  process.argv[1].endsWith('render')
);
if (isDirectRun) {
  const fresh = process.argv.includes('--fresh');
  build(fresh).catch(err => { console.error(err); process.exit(1); });
}
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
2. **两文件分离** — `render.js`（构建）、`dev.js`（开发）各自独立
3. **依赖默认最小** — 默认使用 `js-yaml`、`marked`、`chokidar`、`eta`；必要交互需要额外包时必须固定版本并记录到 `interactions.manifest.json`
4. **模板能力完整** — 使用 Eta 引擎，支持 HTML 转义、raw HTML、条件、数组循环、异步、自定义过滤器
5. **确定性** — 相同输入产生相同输出（缓存哈希机制）
6. **增量构建** — 哈希缓存机制，未变文件不重新渲染
7. **浏览器交互** — build 产物必须能加载 `assets/script.js` 与所需模块；搜索/筛选/灯箱/表单等交互不得依赖 dev server
8. **dev server 注入** — 仅 dev 模式在 HTML `</body>` 前注入 SSE 脚本，build 产物不含
9. **端口自动递增** — dev.js 端口被占用时自动 +1 重试
10. **防抖** — dev.js 文件变更后 300ms 防抖 + 构建锁，避免并发构建
11. **运行时校验** — render.js 启动时校验 config.yml、design-tokens.json、content-types.json
12. **图片处理** — 可选功能，需安装 sharp，生成响应式尺寸 + WebP + blur placeholder
