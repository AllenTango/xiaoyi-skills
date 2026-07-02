# Reference Analysis Prompt

指导 AI 分析参考站点（URL/HTML/截图描述），提取结构化设计意图。

## 输入

- 用户提供的 URL（通过 WebFetch 抓取 HTML）
- 或用户的文字描述/截图描述

## 输出：design-intent.json

```json
{
  "source": "https://example.com/portfolio",
  "extracted_at": "2025-01-15T14:30:00Z",
  "color": {
    "background": "暖白 #faf9f7 / 深灰 #1a1a1a",
    "text": "近黑 #1a1a1a / 暖白 #faf9f7",
    "accent": "深靛蓝 #3b2f7a — 少量用于链接、hr、激活导航",
    "muted": "暖灰 #8a8680 — 元文本、边框、禁用态",
    "border": "发丝线 #e8e6e3 / 微妙 #333333",
    "semantic": {
      "focus": "#3b2f7a",
      "error": "#c0392b",
      "success": "#27ae60"
    }
  },
  "typography": {
    "fontDisplay": "'Fraunces', Georgia, serif — 高对比度、锐利衬线、独特斜体",
    "fontBody": "'Source Serif 4', Georgia, serif — 小字号可读、旧式数字",
    "fontMono": "'JetBrains Mono', monospace — 紧凑间距、清晰标点",
    "scale": {
      "h1": "clamp(2.5rem, 5vw, 4rem) / 1.1",
      "h2": "clamp(1.75rem, 3.5vw, 2.5rem) / 1.2",
      "h3": "clamp(1.25rem, 2.5vw, 1.75rem) / 1.3",
      "body": "1.125rem / 1.75",
      "small": "0.875rem / 1.6"
    },
    "lineLength": "65ch",
    "letterSpacing": {
      "display": "-0.02em",
      "body": "0",
      "caps": "0.08em"
    }
  },
  "spacing": {
    "rhythm": "3rem",
    "gutter": "1.5rem",
    "radius": "3px"
  },
  "layout": {
    "containerMax": "65ch",
    "headerHeight": "auto",
    "footerHeight": "auto",
    "sidebarWidth": "none",
    "gridColumns": 1,
    "gutter": "3rem",
    "rhythm": "3rem"
  },
  "components": {
    "card": "无边框、无阴影 — 仅靠留白分离。标题用标题字体，元信息用静音小字，摘要用正文字体。悬停：标题下划线变强调色。",
    "grid": "不适用 — 单列堆叠",
    "nav": "纯文字、大写、字间距 0.1em、激活态强调色。无默认下划线。",
    "button": "幽灵式 — 强调色文字、发丝边框、内边距 0.75rem 1.5rem。悬停：填充强调色、文字在强调色背景上。",
    "form": "内联标签、输入框底部发丝边框、强调色聚焦环",
    "blockquote": "左边框 3px 强调色、斜体正文、静音引用",
    "code": "等宽、静音背景、内边距 0.2em 0.4em、圆角 3px",
    "pre": "等宽、近黑背景、暖白文字、横向滚动、内边距 1.5rem",
    "hr": "发丝线、居中、20% 宽度、强调色",
    "pagination": "居中、上一页/下一页 + 页码、激活态强调填充、充足触控目标",
    "media": "aspect-video, object-cover, border-radius-inherit"
  },
  "motion": {
    "entrance": "交错淡入上移 (opacity 0→1, translateY 1rem→0) — 150ms 基础, 60ms 交错, cubic-bezier(0.2, 0.8, 0.2, 1)",
    "hover": "颜色过渡 120ms ease-out (链接、按钮、卡片标题)",
    "scroll": "无 — 尊重 prefers-reduced-motion",
    "focus": "强调色轮廓 2px, 偏移 2px — 即时",
    "pageTransition": "即时 — 无客户端路由"
  },
  "fontsSelfHosted": [
    "Fraunces: woff2, variable (opsz, wght, SOFT, WONK), subset latin",
    "Source Serif 4: woff2, variable (wght), subset latin",
    "JetBrains Mono: woff2, variable (wght), subset latin"
  ],
  "uniquenessGuidance": "每次生成应变化：header 底部内边距 (2.5–4rem)、正文字体行高 (1.7–1.85)、强调色使用密度 (仅链接 vs 链接+hr+激活导航)、卡片摘要长度 (2 vs 3 行)、文章页 h1 是否有微妙顶部边框。永不重复相同节奏。",
  "confidence": 0.85,
  "notes": "参考站为单列博客，无侧边栏，导航极简。适合长文阅读。"
}
```

## 分析维度与提取方法

### 1. 色彩
- 使用浏览器开发者工具或计算主色调
- 提取：背景、文字、强调、静音、边框、语义色（focus/error/success）
- 注明亮/暗模式差异（CSS `prefers-color-scheme` 或类名切换）

### 2. 字体
- 识别标题/正文/等宽字体栈（`font-family` 计算值）
- 提取字级层级：h1-h3、body、small、micro 的 `font-size` + `line-height`
- 字长限制（`max-width` 或 `ch` 单位）
- 字间距（`letter-spacing`）

### 3. 间距
- 容器最大宽度
- 节奏/基线网格（模块间垂直间距）
- 间隙/槽宽（grid gap、组件内边距）
- 圆角半径

### 4. 布局
- 栏数（CSS grid/template-columns、flex basis）
- 侧边栏：有无、宽度、位置（左/右）、粘性
- Header/Footer：高度、定位（fixed/sticky/static）、背景、边框
- 英雄区：是否存在、高度、内容结构

### 5. 组件风格
- 卡片：边框/阴影/背景、悬停态、媒体比例、元信息排版
- 导航：文字/图标、大小写、间距、激活态、移动端模式
- 按钮：变体（primary/secondary/ghost）、圆角、内边距、悬停/聚焦
- 表单：标签位置、输入框边框/背景、聚焦态、验证提示
- 引用块：左边框/缩进/字体样式/引用样式
- 代码：内联/块、背景、圆角、行号、复制按钮
- 分页：布局、页码样式、激活态、省略号
- 面包屑：分隔符、层级深度、可点击范围

### 6. 动效
- 入场：类型、时长、缓动、交错延迟
- 悬停：颜色/变换/阴影过渡
- 滚动：视差/揭示/头部阴影
- 聚焦：轮廓/偏移/动画
- 页面切换：是否 SPA、转场类型

### 7. 字体自托管
- 识别 `@font-face` 或字体服务 URL
- 提取字体族、字重、格式、子集

## 处理策略

| 情况 | 处理 |
|------|------|
| 用户给 URL | WebFetch 抓取 HTML，必要时抓取关键 CSS/JS |
| 用户给截图描述 | 根据描述推导，标记 `confidence` 降低 |
| 用户给文字描述 | 直接结构化，无需抓取 |
| 无法提取某字段 | 留空，后续由用户偏好补全 |
| 多参考站融合 | 分别分析，再按用户权重融合（提示用户确认） |

## 输出要求

- 输出完整 `design-intent.json` 结构
- `confidence` 字段标识提取可信度（0-1）
- `notes` 记录关键观察、不确定点、建议后续确认方向
- 所有数值使用 CSS 兼容格式（带单位、clamp() 等）

## 给 AI 的提示

> 你是设计系统分析师。从用户提供的参考站点中提取**可执行的设计规格**，而非主观描述。每个字段必须能直接转化为 CSS 变量或组件规则。遇到模糊不确定处，标记并建议追问用户。