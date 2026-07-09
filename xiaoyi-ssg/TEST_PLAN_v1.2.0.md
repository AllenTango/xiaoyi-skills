# xiaoyi-ssg/v1.2.0 變更測試計劃

> 測試目的：為 commit `ac67b26`（design-skill dispatcher 重構）和 `d26f732`（client-agnostic + responsive）補齊實測證據。

## 測試用例

### 用例 1：design-skill dispatcher 委派行為（驗證 ac67b26）

**目的**：當用戶要求「像 Stripe」時，AI 是否正確委派到 `popular-web-designs/templates/stripe.md`，唔係自製 CSS。

**步驟**：
1. 模擬用戶意圖："我想做個 SaaS landing page，像 Stripe 嘅紫色風，簡潔"
2. 模擬 AI 行為：應 `skill_view(name='popular-web-designs', file_path='templates/stripe.md')`
3. 檢查產出嘅 `.xiaoyi-ssg-design-tokens.json` 嘅 `source_skill` 字段 = `"popular-web-designs/stripe"`
4. 檢查 CSS 顏色值真係來自 stripe template（accent ≈ `#635bff`，font-family = `'Source Sans 3'`）

**環境**：用真實 Hermes Agent 載入 popular-web-designs skill + xiaoyi-ssg，執行完整 pipeline。
**Pass 條件**：
- `source_skill` 字段正確
- CSS 顏色與 Stripe 設計系統對齊（accent ≈ `#635bff` 或類似紫色）
- pipeline build 成功，截圖風格接近 Stripe 風

### 用例 2：fallback 路徑（驗證 ac67b26 fallback 段）

**目的**：當客戶端**冇安裝 design skill** 時，AI 仍可讀 `popular-web-designs/templates/claude.md` 直接生成。

**步驟**：
1. 模擬「client 冇 popular-web-designs skill」嘅環境（即係無法 load 任何 design skill）
2. 模擬用戶意圖："我想做個 blog，無品牌偏好，你自己設計"
3. 模擬 AI 行為：應 fallback 到 `cat popular-web-designs/templates/claude.md`（或 `skill_view`）
4. 檢查產出有 `source_skill = "popular-web-designs/claude"` 或標記為 self-extracted

**Pass 條件**：pipeline 仍可 build，產出嘅設計 token 來自 claude template（parchment bg `#f5f4ed`、serif headline）。

### 用例 3：client-agnostic 文檔可用性（驗證 d26f732）

**目的**：SKILL.md frontmatter `client_compatibility` 描述係咪兼容非 Hermes 客戶端。

**步驟**：
1. 喺一個**非 Hermes 環境**模擬（或文件 walk-through）載入 SKILL.md
2. 確認：frontmatter 有 `client_compatibility` 字段
3. 確認：客戶端要求（load_skill、shell、file-write）係通用描述，唔指明 Hermes-only 命令
4. 確認：「Design System: Always Delegate to Design Skills (Client-Agnostic)」段嘅表格含 Hermes / Claude Code / Codex CLI / Cursor / Aider

**Pass 條件**：SKILL.md 內無 "Hermes Agent — Implementation Notes"、"npx skills add" 等 lock-in 字眼；或者明顯標記為「Hermes-only」且其他 client 有對應替代命令。

### 用例 4：mobile-first responsive 強制（驗證 d26f732）

**目的**：SKILL.md 新加嘅「Responsive & Client-Agnostic Output」段嘅禁制是否實際防止 AI 寫出 UA-sniffing / 桌面-only CSS。

**步驟**：
1. 模擬 AI 為 blog demo 寫 `assets/style.css`
2. grep 結果：
   - `navigator.userAgent` 出現次數 = 0
   - `-webkit-` prefix 出現次數 = 0（除非純 progressive enhancement）
   - `@media (min-width: 768px)` 出現 ≥ 1（mobile-first 證據）
   - `dvh` 或 `svh` 出現 ≥ 1
   - `prefers-reduced-motion` 出現 ≥ 1
   - `prefers-color-scheme` 出現 ≥ 1
3. 用 chrome headless 分別截圖 360px / 768px / 1280px / 1920px 四個 viewport，確認佈局合理

**Pass 條件**：grep 全部通過；4 個 viewport 截圖正常 render。

### 用例 5：5 步必做自測仍 pass（regression）

**目的**：ac67b26 + d26f732 唔應該破壞原本 `322a22f` 嘅自測條款。

**步驟**：喺 `/Users/tango/temp/ssg-demo` 同 `/Users/tango/temp/ssg-demo-b` 各跑：
```
node .xiaoyi-ssg/render.js --fresh
grep -c '<html' public/index.html
grep -c '<%~ body' .xiaoyi-ssg/templates/base.html
grep -cE 'recentItems|recentPosts' .xiaoyi-ssg/templates/index.html
find source -name '*.md' | wc -l  # vs  find public -name 'index.html' | wc -l
```

**Pass 條件**：兩個 demo 都仍 render OK、自測全通過。

### 用例 6：wsman scanner 仍正常（regression）

**目的**：commit 322a22f 嘅 wsman ignore 配置唔應被之後兩個 commit 影響。

**步驟**：喺 `/Users/tango/temp/wsman-test-2`（含 node_modules / dist / 配置 ignore）跑 scanner。

**Pass 條件**：仍正確 ignore，3 層過濾仍 work。

## 失敗處理

- 任一用例 fail：寫 ISSUE 報告，**唔** commit，**唔** push；同波士確認後再修。
- 部分 pass：split 為新嘅 follow-up commit，逐個修。

## 測試環境

- Hermes Agent local（macOS arm64）
- Node v22.23.1，Python 3.11 (hermes-agent venv)
- Chrome headless /Applications/Google Chrome.app
- lark-cli（已綁定）
- 唔需要 github push（測試純 local）

## 預計時間

- 用例 1: 15-20 分鐘（要 load skill、模擬 AI、build + 截圖）
- 用例 2: 10-15 分鐘
- 用例 3: 5 分鐘（純文檔 review）
- 用例 4: 15 分鐘（4 viewport 截圖）
- 用例 5: 5 分鐘（regression）
- 用例 6: 5 分鐘（regression）

總計 ~60-75 分鐘，分多個 turn 跑避免 token 上限。