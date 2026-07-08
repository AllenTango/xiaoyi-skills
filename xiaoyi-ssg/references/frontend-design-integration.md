# Frontend Design — Dispatcher to Existing Hermes Skills

> ⚠️ **重要**：本 skill **不自製 CSS 模板或 design tokens**。所有前端設計決策委派給 Hermes 已安裝的設計 skill，以保證用戶的設計生態系統一致並避免重複勞動。

## 已安裝的設計 skill（Hermes 內）

當用戶通過 `/xiaoyi-ssg` 觸發 pipeline 生成時，**AI 必須根據下表選擇並 load 對應的 skill**：

| 用戶需求 | 應 load 的 skill | 用途 |
|---------|-----------------|------|
| 「像 Stripe / Linear / Vercel 等已知品牌的視覺風格」 | `popular-web-designs` | 從 54 個真實設計系統（Stripe、Linear、Vercel、Notion、Anthropic、Apple、Airbnb 等）選一個，照搬完整 tokens |
| 「原創設計 / 無特定品牌偏好 / 從零開始」 | `claude-design` | 提供設計 *process 與 taste*：scoping brief、生產 variants、驗證 local HTML、避免 AI slop |
| 「要 DESIGN.md 規格文件（持久化的設計 token spec）」 | `design-md` | Google DESIGN.md 格式：YAML front-matter + Markdown 設計理念、WCAG 對比、Tailwind 導出 |
| 「混合：要我先設計流程 + 最後要品牌風格」 | `claude-design` + `popular-web-designs` 兩個 load | claude-design 驅動流程，popular-web-designs 供應視覺詞彙 |

54 個品牌完整清單：airbnb, airtable, apple, bmw, cal, claude, clay, clickhouse, cohere, coinbase, composio, cursor, elevenlabs, expo, figma, framer, hashicorp, ibm, intercom, kraken, linear.app, lovable, MiniMax, mintlify, miro, mistral.ai, mongodb, notion, nvidia, ollama, opencode.ai, pinterest, posthog, raycast, replicate, resend, revolut, runwayml, sanity, sentry, spacex, spotify, stripe, supabase, superhuman, together.ai, uber, vercel, voltagent, warp, webflow, wise, x.ai, zapier。

## AI 生成 pipeline 時的強制流程

1. **解析用戶意圖** —— 確定是否提到品牌名（「像 Stripe」/「Linear 風」/「Vercel style」）或要求原創設計。
2. **load 對應的 design skill** —— 用 `skill_view` 加載。例如：
   ```
   skill_view(name="popular-web-designs", file_path="templates/stripe.md")
   skill_view(name="claude-design")
   skill_view(name="design-md")
   ```
3. **提取設計 token** —— 從加載的 skill 提取：
   - 顏色（bg / fg / accent / border）
   - 字體（font-family stack、字重、字號層級）
   - spacing scale
   - 圓角 / 陰影 / 動效 token
   - 暗色 / 淺色主題（如支持）
4. **寫入 `<SITE_ROOT>/.xiaoyi-ssg-design-tokens.json`** —— token 字段名遵守 popular-web-designs 該品牌的 schema：
   ```json
   {
     "source_skill": "popular-web-designs/stripe",
     "color": { "bg": "#ffffff", "fg": "#0a2540", "accent": "#635bff", ... },
     "typography": { "font_sans": "...", "font_mono": "...", ... },
     ...
   }
   ```
   （source_skill 字段記錄 token 出處，方便日後追溯。）
5. **生成 CSS** —— 用 popular-web-designs 的「Hermes Implementation Notes」中已提供的 CDN font link + font-family stack + 具體顏色值，**直接抄過去**而唔是自己重新設計。
6. **可選：如用戶要 DESIGN.md 持久化** —— 額外調用 `design-md` skill 生成正式 spec 文件。

## Fallback

如果用戶明確說「沒有品牌偏好 / 你來設計」但又沒指定原創 skill：
1. 加載 `claude-design` 走原創流程
2. 若 `claude-design` 無法提供，立即 fallback 到 `popular-web-designs/templates/claude.md`（Anthropic Claude 設計系統，是 Hermes Agent 自身美學最貼近的風格，作為最後預設）

## 用戶可選的 brand preference 字段

若用戶在 config.yml 加上 `site.design.brand: "stripe"`，AI 應自動加載對應品牌模板而唔必對話再問：

```yaml
site:
  design:
    brand: "stripe"  # 可選；見 popular-web-designs/templates/ 完整列表
    source_skill: "popular-web-designs"  # 或 claude-design / design-md
```

## 不允許做的事

- ❌ 不在本 skill 內硬編碼任何 CSS / token / color 值
- ❌ 不寫類似「font-family: Inter」的固定建議（除非來自用戶指定的 design skill）
- ❌ 不繞過 design skills 直接讓 AI 自由發揮 CSS（會產生 generic「AI slop」設計）
- ❌ 不複製 design skills 內的內容到本 skill（保持單一真相來源）

## 何時更新本文件

- 用戶新增 design skill 到 Hermes 時：在「已安裝的設計 skill」表加一行 + 在 fallback 鏈加一條
- popular-web-designs 新增 brand 模板時：更新「54 個品牌」段落（直接 `ls` 該目錄驗證）
- 用戶對設計流程有調整建議時：更新「AI 生成 pipeline 時的強制流程」段