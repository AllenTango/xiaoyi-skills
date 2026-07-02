# Design System Extraction Prompt

指导 AI 将参考站点分析结果 + 用户偏好 + 内置美学知识融合，生成完整的 `.xiaoyi-ssg-design-tokens.json`。

## 输入上下文

```json
{
  "design_intent": { ... },      // reference-analysis.md 输出的 design-intent.json
  "user_preferences": {          // 用户对话中表达的偏好
    "color_direction": "darker, more contrast",
    "spacing": "generous",
    "typography": "serif display, sans body",
    "motion": "subtle, respect reduced motion"
  },
  "content_types": { ... },      // 已定义的内容类型（影响组件需求）
  "site_structure": {            // 站点结构信息
    "has_sidebar": false,
    "has_hero": false,
    "nav_position": "header-right",
    "footer_style": "minimal"
  }
}
```

## 融合策略

### 1. 优先级顺序

1. **用户明确偏好** — 最高优先级，直接覆盖
2. **参考站点提取** — 次优先，作为基础
3. **内置美学知识** — 兜底，填补空白

### 2. 冲突解决

| 冲突类型 | 解决方式 |
|----------|----------|
| 用户想要深色，参考站是浅色 | 以用户为准，生成暗色优先的 tokens，保留亮色作为备选 |
| 用户想要无衬线标题，参考站是衬线 | 以用户为准，但保留参考站的字级层级比例 |
| 参考站有侧边栏，用户站点结构无 | 忽略参考站的 sidebar 相关 tokens |

### 3. 补全规则

若某字段三者均无，使用**合理默认值**：

```json
{
  "color": { ... },           // 中性灰阶 + 单一强调色
  "typography": {             // 系统字体栈 + clamp 流体字级
    "fontDisplay": "system-ui, serif",
    "fontBody": "system-ui, sans-serif",
    "fontMono": "system-ui, monospace"
  },
  "layout": {                 // 单列、容器 65ch、节奏 3rem
    "containerMax": "65ch",
    "sidebarWidth": "none",
    "gridColumns": 1
  },
  "component": {              // 极简风格
    "card": "no-border, whitespace-separation",
    "nav": "text-only, uppercase, letter-spacing-0.1em"
  },
  "motion": {                 // 保守动效
    "entrance": "fade-up, 150ms base, 60ms stagger",
    "hover": "color-transition 120ms ease-out"
  }
}
```

## 输出：完整 `.xiaoyi-ssg-design-tokens.json`

```json
{
  "version": 1,
  "theme_ref": "https://example.com|custom",
  "theme_manifesto_hash": "sha256:...",
  "tokens": {
    "color": {
      "background": "#faf9f7",
      "backgroundDark": "#1a1a1a",
      "text": "#1a1a1a",
      "textDark": "#faf9f7",
      "accent": "#3b2f7a",
      "accentHover": "#2d245e",
      "muted": "#8a8680",
      "border": "#e8e6e3",
      "borderDark": "#333333",
      "focus": "#3b2f7a",
      "error": "#c0392b",
      "success": "#27ae60"
    },
    "typography": {
      "fontDisplay": "'Fraunces', Georgia, serif",
      "fontBody": "'Source Serif 4', Georgia, serif",
      "fontMono": "'JetBrains Mono', monospace",
      "scale": {
        "h1": "clamp(2.5rem, 5vw, 4rem) / 1.1",
        "h2": "clamp(1.75rem, 3.5vw, 2.5rem) / 1.2",
        "h3": "clamp(1.25rem, 2.5vw, 1.75rem) / 1.3",
        "body": "1.125rem / 1.75",
        "small": "0.875rem / 1.6",
        "micro": "0.8125rem / 1.5"
      },
      "lineLength": "65ch",
      "letterSpacing": {
        "display": "-0.02em",
        "body": "0",
        "caps": "0.08em"
      }
    },
    "layout": {
      "containerMax": "65ch",
      "headerHeight": "auto",
      "footerHeight": "auto",
      "sidebarWidth": "none",
      "gridColumns": 1,
      "gutter": "3rem",
      "rhythm": "3rem",
      "radius": "3px"
    },
    "component": {
      "card": "no-border, whitespace-separation",
      "cardMedia": "aspect-video, object-cover, border-radius-inherit",
      "nav": "text-only, uppercase, letter-spacing-0.1em",
      "button": "ghost, accent-text, hairline-border",
      "form": "inline-labels, hairline-bottom-border",
      "blockquote": "left-border-3px-accent, italic",
      "code": "muted-bg, padding-0.2em-0.4em, radius-3px",
      "pre": "dark-bg, light-text, overflow-auto",
      "media": "aspect-video, object-cover, border-radius-inherit",
      "pagination": "centered, numbered, active-accent",
      "breadcrumb": "minimal, slash-separator"
    },
    "motion": {
      "entrance": "staggered fade-up, 150ms base, 60ms stagger",
      "hover": "color-transition 120ms ease-out",
      "focus": "accent-outline-2px offset-2px",
      "transitionFast": "120ms ease-out",
      "transitionBase": "150ms cubic-bezier(0.2, 0.8, 0.2, 1)"
    }
  },
  "darkMode": {
    "color": {
      "background": "#1a1a1a",
      "text": "#faf9f7",
      "border": "#333333",
      "muted": "#8a8680"
    }
  },
  "seed": 123456789
}
```

## 字段生成细则

### Color（色彩）

- **背景/文字**：提取主背景、主文字，生成亮/暗对应值
- **强调色**：单一主强调色 + 悬停态（稍深/浅 10-15%）
- **静音色**：文字的 40-50% 不透明度或中性灰
- **边框色**：背景与文字中间值，亮/暗各一
- **语义色**：focus=accent、error=红、success=绿（可从参考站提取或用标准值）

### Typography（排版）

- **字体栈**：优先提取参考站 `font-family`，不可用时用系统字体回退栈
- **字级阶梯**：基于 `clamp(min, vw, max) / line-height`，保持流体排版
- **行长**：`65ch` 为基准，参考站不同则调整
- **字间距**：display 负值、body 0、caps 正值

### Layout（布局）

- **容器宽度**：直接用排版 `lineLength` 或参考站容器 `max-width`
- **Header/Footer**：高度（auto/fixed/rem）、定位
- **侧边栏**：宽度（none/rem/%）、位置
- **网格列数**：1/2/3/12 等
- **节奏/间隙**：垂直节奏基线、组件间隙
- **圆角**：统一半径值

### Component（组件）

将参考站组件风格转为**描述性字符串**，供管线生成时转为 CSS：

| 组件 | 描述格式 | 示例 |
|------|----------|------|
| card | "border/shadow/background, separation-method, hover-effect" | "no-border, whitespace-separation, title-underline-on-hover" |
| nav | "style, case, spacing, active-style" | "text-only, uppercase, letter-spacing-0.1em, accent-text" |
| button | "variant, text-color, border, padding, hover-fill" | "ghost, accent-text, hairline-border, 0.75rem-1.5rem, fill-accent" |
| form | "label-position, input-border, focus-ring" | "inline-labels, hairline-bottom, accent-ring" |

### Motion（动效）

- **入场**：类型、基础时长、交错延迟、缓动函数
- **悬停**：过渡属性、时长、缓动
- **聚焦**：轮廓宽度/颜色/偏移
- **基础过渡**：快速/基础两档

### Dark Mode（暗色模式）

仅覆盖 color 组中受亮度影响的字段：background、text、border、muted。其余复用亮色 tokens。

### Seed（随机种子）

- 从 `theme_manifesto_hash` + `tokens` 内容哈希派生
- 确保同一配置生成的管线完全一致
- 用户可手动指定种子以复现特定变体

## 交互确认点

生成前向用户确认关键决策：

```
AI: "基于参考站 + 您的偏好，我生成了初步设计系统。请确认几个关键点：
1. 主色调：深靛蓝 #3b2f7a（参考站） → 您想改吗？
2. 标题字体：Fraunces (衬线) → 换成无衬线？
3. 布局：单列、无侧边栏、容器 65ch → 需要侧边栏？
4. 卡片：无边框、留白分离 → 要加边框/阴影？
5. 动效：淡入上移 150ms → 更快/更慢/关闭？

确认后我将写入 .xiaoyi-ssg-design-tokens.json 并生成渲染管线。"
```

## 给 AI 的提示

> 你是设计系统工程师。输出的 tokens 必须**完整、自洽、可直接生成 CSS 变量**。不要留空字段。每个数值都要有单位、用 CSS 兼容语法。用户偏好是最高指令，参考站只提供灵感而非约束。生成前务必逐项确认关键视觉决策。