# Frontend Design — Dispatcher to Design Skills (Client-Agnostic)

> ⚠️ **重要**：本 skill **不自製 CSS 模板或 design tokens**。所有前端設計決策委派給 AI client 已安裝的設計 skill，以保證用戶的設計生態系統一致並避免重複勞動。

## 跨 client 兼容

本文件列出的 dispatcher 邏輯適配主流 AI coding client。下表映射每個 client 對「design skill」嘅約定：

| Client | Skill 目錄 / 安裝方式 | 載入命令範例 |
|--------|----------------------|--------------|
| **Hermes Agent** | `~/.hermes/skills/<name>/` | `skill_view(name="popular-web-designs", file_path="templates/stripe.md")` |
| **Claude Code** | `~/.claude/skills/<name>/` 或 marketplace plugin | `/plugin install claude-design` 或本地 `~/.claude/skills/...` |
| **OpenAI Codex CLI** | `~/.codex/skills/<name>/` | `/skills load popular-web-designs` |
| **Cursor** | `~/.cursor/rules/` 或 `.cursor/skills/` | 直接放 Markdown 到 rules 目錄 |
| **Aider** | repo `.aider/` 或 `~/.aider/` rules | `--read <file>` 將 design 規範注入 context |
| **Continue.dev** | `~/.continue/skills/<name>/` | config 內顯式 load |
| **OpenHands / Roo Code / Cline** | 各 client 自定，通常類似上面 | 各 client 自定 |

所有 54 個品牌模板本身（`popular-web-designs/templates/*.md`）都係**純 Markdown 文件**，無需特定 client 即可用任何 client 嘅 file-read 命令讀取。

## 設計 skill 選擇矩陣

當用戶通過 `/xiaoyi-ssg` 觸發 pipeline 生成時，**AI 必須根據用戶意圖 + 自己 client 嘅可用 skill** 選擇：

| 用戶意圖 | 推薦設計來源 | 載入方式（Hermes 為例） |
|---------|--------------|--------------------------|
| 「像 Stripe / Linear / Vercel / Anthropic 等已知品牌視覺風格」 | 從 54 個真實設計系統（Stripe、Linear、Vercel、Notion、Anthropic、Apple、Airbnb 等）選一個，照搬完整 tokens | `skill_view(name="popular-web-designs", file_path="templates/<brand>.md")` 或直接 `cat templates/<brand>.md` |
| 「原創設計 / 無特定品牌偏好 / 你自己設計」 | `claude-design` skill 或直接讀 `templates/claude.md` 作 fallback | `skill_view(name="claude-design")` |
| 「要 DESIGN.md 規格文件（持久化的設計 token spec）」 | `design-md` skill | `skill_view(name="design-md")` |
| 「混合：要我先設計流程 + 最後要品牌風格」 | 同時 load `claude-design` + `popular-web-designs` | 兩個 `skill_view` 連用 |

54 個品牌完整清單：airbnb, airtable, apple, bmw, cal, claude, clay, clickhouse, cohere, coinbase, composio, cursor, elevenlabs, expo, figma, framer, hashicorp, ibm, intercom, kraken, linear.app, lovable, MiniMax, mintlify, miro, mistral.ai, mongodb, notion, nvidia, ollama, opencode.ai, pinterest, posthog, raycast, replicate, resend, revolut, runwayml, sanity, sentry, spacex, spotify, stripe, supabase, superhuman, together.ai, uber, vercel, voltagent, warp, webflow, wise, x.ai, zapier。

## AI 生成 pipeline 時的強制流程

1. **解析用戶意圖** —— 確定是否提到品牌名（「像 Stripe」/「Linear 風」/「Vercel style」）或要求原創設計。
2. **load 對應的 design skill 或讀 markdown 文件** —— 按你 client 嘅命令：
   - Hermes: `skill_view(name="popular-web-designs", file_path="templates/stripe.md")`
   - Claude Code: 確保 plugin 裝咗 `claude-design`，或用 `Read` 命令讀取 design template 嘅 Markdown
   - Aider: `--read popular-web-designs/templates/stripe.md`
   - 任何 client: `cat` / `Read` 該 markdown 文件即可
3. **提取設計 token** —— 從加載的內容提取：
   - 顏色（bg / fg / accent / border）
   - 字體（font-family stack、字重、字號層級）
   - spacing scale
   - 圓角 / 陰影 / 動效 token
   - 暗色 / 淺色主題（如支持）
4. **规范化并写入 `<SITE_ROOT>/.xiaoyi-ssg-design-tokens.json`** —— 先读取 `prompts/design-system-extraction.md`，再将设计来源转换为 `schemas/design-tokens.json` 定义的 xiaoyi token schema：
   ```json
   {
     "version": 1,
     "source_skill": "popular-web-designs/stripe",
     "source_ref": "skill:popular-web-designs/templates/stripe.md",
     "theme_ref": "stripe",
     "theme_manifesto_hash": "sha256:<64 lowercase hex chars>",
     "tokens": {
       "color": {
         "background": "#ffffff",
         "text": "#0a2540",
         "accent": "#635bff"
       },
       "typography": {
         "fontBody": "copied from the loaded design source"
       }
     },
     "darkMode": {
       "color": {
         "background": "#0a0a0a",
         "text": "#f6f9fc"
       }
     },
     "seed": 123456789
   }
   ```
   （`source_skill` 字段記錄 token 出處，方便日後追溯。其他 client 用「`<client>/<skill>`」格式，例如 `claude-code/claude-design`、`aider/templates-claude`。）
5. **生成 CSS** —— 使用规范化后的 xiaoyi tokens，并把设计来源中提供的 font link、font-family stack、颜色值和组件规则作为唯一设计依据；可以适配到当前站点结构，但唔可以重新设计一套视觉系统。
6. **可選：如用戶要 DESIGN.md 持久化** —— 額外調用 `design-md` skill 生成正式 spec 文件。

## Fallback（無 design skill 時）

如果用戶明確說「沒有品牌偏好 / 你來設計」但又沒指定任何設計 skill：
1. 如本机可访问 `popular-web-designs/templates/claude.md`，直接用 file-read 命令读取它（Anthropic Claude 設計系統，係常见的完整 design template）
2. 視為「讀取 Markdown 參考文檔」而非「調用 skill」——**功能上等價**
3. 跟住上面 §流程 step 3-5 同樣處理

如果完全冇任何 design reference 可用：
1. 读取 `prompts/design-system-extraction.md`，基于用户明确描述做最小 self-extracted 规范化
2. 將 `source_skill` 字段標記為 `"self-extracted"` 表示 AI 自己生成（**warning**：唔係 brand 真實設計）

## 用戶可選的 brand preference 字段

若用戶在 config.yml 加上 `site.design.brand: "stripe"`，AI 應自動加載對應品牌模板而唔必對話再問：

```yaml
site:
  design:
    brand: "stripe"  # 可選；見 popular-web-designs/templates/ 完整列表
    source_skill: "popular-web-designs"  # 或 claude-design / design-md
```

`source_skill` 唔限於 Hermes skill 名——任何 client 嘅 design skill 或直接 file-read 都可。

## 不允許做的事

- ❌ 不在本 skill 內硬編碼任何 CSS / token / color 值
- ❌ 不寫類似「font-family: Inter」的固定建議（除非來自用戶指定的 design skill）
- ❌ 不繞過 design skills 直接讓 AI 自由發揮 CSS（會產生 generic「AI slop」設計）
- ❌ 不複製 design skills 內的內容到本 skill（保持單一真相來源）
- ❌ 不寫死特定 AI client 的命令（保持 client-agnostic）

## 何時更新本文件

- 主流 AI client 新增或修改 skills-protocol 時：更新「跨 client 兼容」表
- popular-web-designs 新增 brand 模板時：更新「54 個品牌」段落（直接 `ls` 該目錄驗證）
- 用戶對設計流程有調整建議時：更新「AI 生成 pipeline 時的強制流程」段
- 發現新嘅 design skill 模式時：加到「設計 skill 選擇矩陣」
